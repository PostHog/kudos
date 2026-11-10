#!/usr/bin/env bash
# Proves the root Dockerfile's image boots as the host runs it: as user 1000, on $PORT, under the host's memory and CPU
# limits, with and without a database, serving the commit it was built from, and sending fetch through HTTPS_PROXY.
# Usage: service/scripts/check-image.sh <image> <expected commit>
set -euo pipefail

image="$1"
commit="$2"
postgres_image="postgres:18.6@sha256:e3d24f6906d0760bf4da0dae872415391ededefad23fd471c47dc53b0ddf3c42"
run_id="hedgehug-check-$$"
limits=(--memory 512m --cpus 0.5)

cleanup() {
  docker rm -f "$run_id-db" "$run_id-app" "$run_id-bare" >/dev/null 2>&1 || true
  docker network rm "$run_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  for container in "$run_id-app" "$run_id-bare"; do docker logs "$container" 2>&1 | tail -20 >&2 || true; done
  exit 1
}

# Polls a container's /healthz until the JSON answer holds the wanted text, within the host's 120 s to listen.
wait_for_health() {
  local port="$1" want="$2" body=""
  for _ in $(seq 1 120); do
    body="$(curl -fsS "http://127.0.0.1:$port/healthz" 2>/dev/null || true)"
    [[ "$body" == *"$want"* ]] && { echo "$body"; return 0; }
    sleep 1
  done
  fail "/healthz on port $port never answered with $want (last: $body)"
}

status_of() { curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$1$2"; }

user="$(docker image inspect "$image" --format '{{.Config.User}}')"
[[ "$user" == "1000" ]] || fail "the image runs as '$user', not 1000"
echo "ok: runs as user 1000"

docker network create "$run_id" >/dev/null
docker run -d --name "$run_id-db" --network "$run_id" -e POSTGRES_PASSWORD=check -e POSTGRES_DB=hedgehug "$postgres_image" >/dev/null

# Without DATABASE_URL, as on the host's first boot: it listens, answers /healthz and 503s the rest.
docker run -d --name "$run_id-bare" "${limits[@]}" -e PORT=8080 -p 127.0.0.1::8080 "$image" >/dev/null
bare_port="$(docker port "$run_id-bare" 8080/tcp | head -1 | sed 's/.*://')"
wait_for_health "$bare_port" '"migrations":"no-database"' >/dev/null
[[ "$(status_of "$bare_port" /)" == "503" ]] || fail "an app route without a database did not answer 503"
echo "ok: boots without DATABASE_URL, /healthz answers, the rest is 503"

# With a database, under the same limits: it migrates and opens its routes, serving the built commit.
for _ in $(seq 1 60); do docker exec "$run_id-db" pg_isready -U postgres -d hedgehug >/dev/null 2>&1 && break; sleep 1; done
docker run -d --name "$run_id-app" "${limits[@]}" --network "$run_id" -e PORT=9090 -p 127.0.0.1::9090 \
  -e DATABASE_URL="postgres://postgres:check@$run_id-db:5432/hedgehug" "$image" >/dev/null
app_port="$(docker port "$run_id-app" 9090/tcp | head -1 | sed 's/.*://')"
health="$(wait_for_health "$app_port" '"migrations":"done"')"
[[ "$health" == *"\"commit\":\"$commit\""* ]] || fail "/healthz serves '$health', not commit $commit"
[[ "$(status_of "$app_port" /nowhere.txt)" == "404" ]] || fail "an unknown file after the migrations did not answer 404"
echo "ok: migrates under --memory 512m --cpus 0.5 on \$PORT and serves commit $commit"

# The website's build is in the image: its page, with the policy, at any address, and its hashed files cached for good.
page_headers="$(curl -fsS -D - -o /dev/null "http://127.0.0.1:$app_port/leaderboard")" || fail "the website's page did not answer"
[[ "$page_headers" == *"content-security-policy: default-src 'self'"* ]] || fail "the website's page came without its policy: $page_headers"
asset="$(curl -fsS "http://127.0.0.1:$app_port/" | grep -o '/assets/index-[A-Za-z0-9_-]*\.js' | head -1)"
[[ -n "$asset" ]] || fail "the website's page names no built script"
[[ "$(curl -fsS -D - -o /dev/null "http://127.0.0.1:$app_port$asset")" == *"cache-control: public, max-age=31536000, immutable"* ]] || fail "$asset is not cached for good"
echo "ok: serves the website's build with its policy and cache headers"
docker stats --no-stream --format 'memory after boot: {{.MemUsage}}' "$run_id-app"

# fetch goes through HTTPS_PROXY: a proxy that refuses connections makes a public fetch fail on the proxy's port.
proxied="$(docker run --rm "${limits[@]}" -e HTTPS_PROXY=http://127.0.0.1:9 "$image" node -e \
  "fetch('https://example.com').then(() => console.log('direct'), (error) => console.log(error.cause?.code ?? error.message))")"
[[ "$proxied" == "ECONNREFUSED" ]] || fail "fetch ignored HTTPS_PROXY (answered: $proxied)"
echo "ok: fetch honours HTTPS_PROXY"

docker stop -t 10 "$run_id-app" >/dev/null
exit_code="$(docker inspect "$run_id-app" --format '{{.State.ExitCode}}')"
[[ "$exit_code" == "0" ]] || fail "the service exited $exit_code on SIGTERM"
echo "ok: stops cleanly on SIGTERM"
