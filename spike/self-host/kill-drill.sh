#!/usr/bin/env bash
# Spike only, never merged. Kill -9 the container at each step of a first boot's push, start it again on the same
# database, and check the second boot listens and answers a signed Slack event. Run after measure.sh has built $IMAGE.
#   spike/self-host/kill-drill.sh [mark ...]    default marks: schema-ready blobs-mirrored-before-commit functions-deployed
set -euo pipefail
cd "$(dirname "$0")/../.."
here=spike/self-host
export IMAGE=${IMAGE:-kudos-spike:measure}
export OUT=${OUT:-/tmp/kudos-spike/kill-drill}
mkdir -p "$OUT"
marks=("$@")
[ ${#marks[@]} -gt 0 ] || marks=(push-started schema-ready blobs-mirrored-before-commit functions-deployed canonical-urls-set)
printf '%s\n' MAX_ISOLATE_WORKERS=4 APPLICATION_MAX_CONCURRENT_V8_ACTIONS=4 APPLICATION_MAX_CONCURRENT_NODE_ACTIONS=2 INDEX_CACHE_SIZE=33554432 UDF_CACHE_MAX_SIZE=16777216 SHARED_UDF_CACHE_MAX_SIZE=33554432 FUNRUN_MODULE_CACHE_SIZE=33554432 FUNRUN_CODE_CACHE_SIZE=33554432 FUNRUN_INDEX_CACHE_SIZE=16777216 SOURCE_MAP_CACHE_MAX_SIZE_BYTES=16777216 INDEX_BACKFILL_WORKERS=1 > "$OUT/knobs.env"
docker inspect spike-pg >/dev/null 2>&1 || $here/run.sh pg > "$OUT/pg.log" 2>&1

for mark in "${marks[@]}"; do
  docker exec spike-pg psql -p 15432 -U postgres -c "DROP DATABASE IF EXISTS kudos_spike" -c "CREATE DATABASE kudos_spike OWNER kudos" >/dev/null
  EXTRA_ENV="--env-file $OUT/knobs.env" $here/run.sh start a 18080 >/dev/null
  timeout 120 bash -c "until docker logs spike-a 2>&1 | grep -q '\"spike\":\"$mark\"'; do sleep 0.1; done"
  docker kill -s KILL spike-a >/dev/null
  docker logs spike-a > "$OUT/$mark-first.log" 2>&1
  EXTRA_ENV="--env-file $OUT/knobs.env" $here/run.sh start a 18080 >/dev/null
  if $here/run.sh wait a > "$OUT/$mark-second.txt" 2>&1; then
    answer=$(node $here/load.mjs burst http://127.0.0.1:18080 2 0 1 | head -1)
    echo "$mark: killed, second boot $(grep -o 'listening: [0-9]* ms' "$OUT/$mark-second.txt"), $(grep -o '"push-skipped"\|"functions-deployed"' "$OUT/$mark-second.txt" | head -1), team_join $answer"
  else
    echo "$mark: killed, second boot FAILED: $(grep -E 'Error|error' "$OUT/$mark-second.txt" | head -2 | cut -c1-300)"
  fi
  docker logs spike-a > "$OUT/$mark-second.log" 2>&1 || true
  $here/run.sh stop a
done
