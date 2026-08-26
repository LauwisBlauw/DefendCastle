#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Push the smoke test to the running game and wait for its report.
#  Usage:  npm run smoke   (or: bash scripts/run-smoke.sh [timeout_seconds])
#  Needs:  curl + python3, and `npm run dev` already running.
#          (deliberately NOT jq — it isn't installed on this machine)
#  Exits non-zero if any assertion failed, so it can gate a commit or CI step.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TIMEOUT=${1:-300}
BASE_URL="http://localhost:5173"
SCRIPT_FILE="$(dirname "$0")/smoke.js"

if ! curl -sf "$BASE_URL" > /dev/null 2>&1; then
  echo "ERROR: dev server not running at $BASE_URL — start it with: npm run dev"
  exit 1
fi

echo "▶  Sending smoke test…"
BEFORE_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
python3 -c 'import json,sys; print(json.dumps({"script":open(sys.argv[1]).read()}))' "$SCRIPT_FILE" \
  | curl -sf -X POST "$BASE_URL/test-run" -H 'Content-Type: application/json' -d @- > /dev/null

echo "⏳  Waiting (up to ${TIMEOUT}s)…"
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  sleep 5; ELAPSED=$((ELAPSED + 5))
  RESULT=$(curl -sf "$BASE_URL/test-result" 2>/dev/null || echo "")
  [ -z "$RESULT" ] && continue
  if printf '%s' "$RESULT" | BEFORE="$BEFORE_TS" python3 -c '
import json,sys,os
try: d=json.load(sys.stdin)
except Exception: sys.exit(2)
if not d.get("generated") or d["generated"] <= os.environ["BEFORE"]: sys.exit(2)
s=d.get("summary",{})
print()
print(f'"'"'PASSED: {s.get("passed",0)}   FAILED: {s.get("failed",0)}   ERRORS: {s.get("errors",0)}'"'"')
print("-"*60)
for p in d.get("pass",[]): print(f'"'"'  PASS  {p["name"]}'"'"')
for f in d.get("fail",[]): print(f'"'"'  FAIL  {f["name"]} -- {f["why"]}'"'"')
for e in d.get("errors",[])[:5]: print(f'"'"'  ERR   {e}'"'"')
sys.exit(1 if s.get("failed",0) or s.get("errors",0) else 0)
'; then exit 0; else
    rc=$?
    [ $rc -eq 1 ] && exit 1     # ran, but assertions failed
  fi
  echo "   …still running (${ELAPSED}s)"
done
echo "Timed out after ${TIMEOUT}s"; exit 1
