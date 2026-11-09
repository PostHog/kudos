#!/usr/bin/env bash
# Spike only, never merged. Runs the spike container the way the target host would: 512 MiB with no swap, half a CPU,
# uid 1000, no capabilities, no volume, against Postgres 16 with a 20-connection role and a 30 s statement timeout.
#
#   spike/self-host/run.sh pg                       start Postgres 16 and the app's restricted role and database
#   spike/self-host/run.sh start <copy> <port>      start one app copy (A on 18080, B on 18081, ...), sample its cgroup
#   spike/self-host/run.sh wait <copy>              block until the copy logs "listening", print its startup marks
#   spike/self-host/run.sh stats <copy>             print the copy's cgroup memory and CPU counters
#   spike/self-host/run.sh stop <copy>              stop and remove the copy
#   spike/self-host/run.sh clean                    remove every spike container
#
# LIMITS overrides the memory and CPU flags; LIMITS="" runs an unconstrained control copy.
#
# Containers use the host network so the app reaches the mock Slack issuer the handshake suite starts on
# 127.0.0.1:3412; the backend binds loopback only, and members reach the copy through its one port.
set -euo pipefail
IMAGE=${IMAGE:-kudos-spike:arm64}
OUT=${OUT:-/tmp/kudos-spike/latest}
PGPORT=${PGPORT:-15432}
mkdir -p "$OUT"
secret_file="$OUT/instance-secret"
[ -s "$secret_file" ] || (umask 077; openssl rand -hex 32 > "$secret_file")

cg() { echo "/sys/fs/cgroup/system.slice/docker-$(docker inspect -f '{{.Id}}' "spike-$1").scope"; }

case "$1" in
  pg)
    docker rm -f spike-pg >/dev/null 2>&1 || true
    docker run -d --name spike-pg --network host -e POSTGRES_PASSWORD=spike-admin postgres:16-alpine -c port="$PGPORT" >/dev/null
    until docker exec spike-pg pg_isready -p "$PGPORT" -U postgres >/dev/null 2>&1; do sleep 1; done
    sleep 2
    docker exec -i spike-pg psql -v ON_ERROR_STOP=1 -p "$PGPORT" -U postgres <<'SQL'
CREATE ROLE kudos LOGIN PASSWORD 'spike' NOSUPERUSER NOCREATEDB NOCREATEROLE CONNECTION LIMIT 20;
ALTER ROLE kudos SET statement_timeout = '30s';
CREATE DATABASE kudos_spike OWNER kudos;
SELECT rolname, rolsuper, rolcreatedb, rolconnlimit, rolconfig FROM pg_roles WHERE rolname = 'kudos';
SQL
    docker exec spike-pg postgres --version
    ;;
  start)
    copy=$2 port=$3
    offset=$(( port - 18080 ))
    docker rm -f "spike-$copy" >/dev/null 2>&1 || true
    node "$(dirname "$0")/env.mjs" "$port" > "$OUT/app-$copy.env"
    chmod 600 "$OUT/app-$copy.env"
    date -u +%s%3N > "$OUT/start-$copy.ms"
    docker run -d --name "spike-$copy" --network host \
      ${LIMITS---memory 512m --memory-swap 512m --cpus 0.5} --user 1000 --cap-drop ALL --security-opt no-new-privileges \
      --env-file "$OUT/app-$copy.env" \
      -e PORT="$port" -e BACKEND_PORT=$(( 13210 + offset * 10 )) -e SITE_PORT=$(( 13211 + offset * 10 )) \
      -e INSTANCE_NAME=kudos-spike -e INSTANCE_SECRET="$(cat "$secret_file")" \
      -e DATABASE_URL="postgres://kudos:spike@127.0.0.1:$PGPORT/kudos_spike" -e DO_NOT_REQUIRE_SSL=1 \
      -e POSTGRES_MAX_CONNECTIONS="${POSTGRES_MAX_CONNECTIONS:-5}" \
      ${EXTRA_ENV:-} \
      "$IMAGE" >/dev/null
    path=$(cg "$copy")
    ( while [ -d "$path" ]; do echo "$(date -u +%s%3N) $(cat "$path/memory.current" 2>/dev/null || echo 0)"; sleep 0.2; done ) > "$OUT/memory-$copy.samples" 2>/dev/null &
    echo "started spike-$copy on $port, sampling $path"
    ;;
  wait)
    copy=$2
    started=$(cat "$OUT/start-$copy.ms")
    for _ in $(seq 1 600); do
      if docker logs "spike-$copy" 2>&1 | grep -q '"spike":"listening"'; then break; fi
      if [ "$(docker inspect -f '{{.State.Running}}' "spike-$copy")" != true ]; then echo "spike-$copy exited"; docker logs --tail 40 "spike-$copy"; exit 1; fi
      sleep 0.2
    done
    now=$(date -u +%s%3N)
    echo "host wall time from docker run to listening: $(( now - started )) ms (sampling granularity 200 ms)"
    docker logs "spike-$copy" 2>&1 | grep '"spike"'
    ;;
  stats)
    path=$(cg "$2")
    echo "memory.current $(cat "$path/memory.current")"
    echo "memory.peak $(cat "$path/memory.peak")"
    tr '\n' ' ' < "$path/memory.events"; echo
    grep -E '^(anon|file|kernel|sock|shmem) ' "$path/memory.stat" | tr '\n' ' '; echo
    tr '\n' ' ' < "$path/cpu.stat"; echo
    awk 'max<$2{max=$2} END{print "sampled max memory.current", max}' "$OUT/memory-$2.samples"
    ;;
  stop)
    docker rm -f "spike-$2" >/dev/null 2>&1 || true
    ;;
  clean)
    docker rm -f spike-a spike-b spike-c spike-pg >/dev/null 2>&1 || true
    ;;
esac
