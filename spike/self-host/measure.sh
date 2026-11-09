#!/usr/bin/env bash
# Spike only, never merged. The whole measurement in one command, so it runs the same on any machine (CI runs it
# on amd64): build the image, start Postgres, then
#   1. first boot on an empty database (the push), with 4 isolate workers, the count whose push fits in 512 MiB;
#   2. restart from the blob mirror (push skipped), with 8 workers, then a signed burst of team_join and kudos;
#   3. overlap: a second copy starts while the first serves a kudos stream; the first stops 5 s after the second listens.
# Every number lands in $OUT. Needs docker, node 24 with this repo's node_modules (for jose), curl and openssl.
set -euo pipefail
cd "$(dirname "$0")/../.."
here=spike/self-host
export IMAGE=${IMAGE:-kudos-spike:measure}
export OUT=${OUT:-/tmp/kudos-spike/measure}
mkdir -p "$OUT"
uname -m > "$OUT/arch.txt"
dmesg_from=$(sudo -n dmesg 2>/dev/null | wc -l || echo 0)

docker build -f $here/Dockerfile -t "$IMAGE" . > "$OUT/build.log" 2>&1
$here/run.sh pg > "$OUT/pg.log" 2>&1

common="APPLICATION_MAX_CONCURRENT_NODE_ACTIONS=2 INDEX_CACHE_SIZE=33554432 UDF_CACHE_MAX_SIZE=16777216 SHARED_UDF_CACHE_MAX_SIZE=33554432 FUNRUN_MODULE_CACHE_SIZE=33554432 FUNRUN_CODE_CACHE_SIZE=33554432 FUNRUN_INDEX_CACHE_SIZE=16777216 SOURCE_MAP_CACHE_MAX_SIZE_BYTES=16777216 INDEX_BACKFILL_WORKERS=1"
printf '%s\n' MAX_ISOLATE_WORKERS=4 APPLICATION_MAX_CONCURRENT_V8_ACTIONS=4 $common > "$OUT/knobs-push.env"
printf '%s\n' MAX_ISOLATE_WORKERS=8 APPLICATION_MAX_CONCURRENT_V8_ACTIONS=8 $common > "$OUT/knobs-serve.env"

step() { echo "== $*"; }
snapshot() { $here/run.sh stats "$1" > "$OUT/stats-$2.txt" 2>&1 || true; docker logs "spike-$1" > "$OUT/$1-$2.log" 2>&1 || true; }

step "1. first boot, push"
EXTRA_ENV="--env-file $OUT/knobs-push.env" $here/run.sh start a 18080
$here/run.sh wait a | tee "$OUT/wait-boot1.txt"
sleep 10
snapshot a boot1
$here/run.sh stop a
mv "$OUT/memory-a.samples" "$OUT/memory-a-boot1.samples"

step "2. restart from the mirror, then the burst"
EXTRA_ENV="--env-file $OUT/knobs-serve.env" $here/run.sh start a 18080
$here/run.sh wait a | tee "$OUT/wait-boot2.txt"
sleep 10
snapshot a boot2-idle
timeout 280 node $here/load.mjs burst http://127.0.0.1:18080 30 60 2 | tee "$OUT/load-burst.log"
snapshot a after-burst

step "3. overlap"
sleep 10
timeout 120 node $here/load.mjs stream http://127.0.0.1:18080 http://127.0.0.1:18081 60 1000 > "$OUT/overlap-stream.log" 2>&1 &
stream=$!
( for _ in $(seq 1 450); do for p in 18080 18081; do printf '%s %s %s\n' "$(date -u +%s%3N)" $p "$(curl -s -o /dev/null -m 1 -w '%{http_code}' http://127.0.0.1:$p/version || true)"; done; sleep 0.2; done ) > "$OUT/overlap-version-probe.log" 2>&1 &
probe=$!
sleep 10
date -u +%s%3N > "$OUT/overlap-b-start.ms"
EXTRA_ENV="--env-file $OUT/knobs-serve.env" $here/run.sh start b 18081
$here/run.sh wait b | tee "$OUT/wait-overlap-b.txt"
sleep 5
docker logs spike-a > "$OUT/a-overlap.log" 2>&1 || true
date -u +%s%3N > "$OUT/overlap-a-stop.ms"
$here/run.sh stop a
wait "$stream" || true
kill "$probe" 2>/dev/null || true
snapshot b overlap
bs=$(cat "$OUT/overlap-b-start.ms")
awk -v bs="$bs" '$2==18080 && $3=="200" {last=$1} $2==18081 && $3=="200" && !b {b=$1} END {print "A last /version 200 at B+" (last-bs) " ms; B first /version 200 at B+" (b-bs) " ms"}' "$OUT/overlap-version-probe.log" | tee "$OUT/overlap-gap.txt"
cat "$OUT/overlap-stream.log"

sudo -n dmesg 2>/dev/null | tail -n +"$((dmesg_from + 1))" | grep -E "Killed process" > "$OUT/oom-kills.txt" || true
$here/run.sh clean
step "done: $OUT"
