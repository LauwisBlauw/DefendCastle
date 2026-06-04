#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Run the balance diagnostic and wait for the JSON report.
#  Usage:  ./scripts/run-diagnostic.sh [timeout_seconds]
#  Default timeout: 240s (4 min).  Requires: jq, curl, npm run dev running.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

TIMEOUT=${1:-360}
SCRIPT_FILE="$(dirname "$0")/diagnostic.js"
BASE_URL="http://localhost:5173"

if ! curl -sf "$BASE_URL" > /dev/null 2>&1; then
  echo "ERROR: Dev server not running at $BASE_URL — start it with: npm run dev"
  exit 1
fi

echo "▶  Sending diagnostic script to browser…"
BEFORE_TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# JSON-encode the script file and POST it to /test-run
jq -Rs '{"script":.}' "$SCRIPT_FILE" \
  | curl -sf -X POST "$BASE_URL/test-run" \
      -H 'Content-Type: application/json' \
      -d @- > /dev/null

echo "⏳  Waiting for results (up to ${TIMEOUT}s)…"
echo "   (browser console shows live progress)"

# Poll /test-result until a result newer than BEFORE_TS appears
ELAPSED=0
POLL=5
while [ $ELAPSED -lt $TIMEOUT ]; do
  sleep $POLL
  ELAPSED=$((ELAPSED + POLL))

  RESULT=$(curl -sf "$BASE_URL/test-result" 2>/dev/null || echo "")
  if [ -z "$RESULT" ]; then continue; fi

  # Check timestamp in result is newer than when we sent the script
  RESULT_TS=$(echo "$RESULT" | jq -r '.generated // empty' 2>/dev/null || echo "")
  if [ -n "$RESULT_TS" ] && [[ "$RESULT_TS" > "$BEFORE_TS" ]]; then
    echo ""
    echo "✅  Diagnostic complete (${ELAPSED}s elapsed)"
    echo "────────────────────────────────────────────────────────────────"
    echo "$RESULT" | jq '.'
    exit 0
  fi

  echo "   …still running (${ELAPSED}s elapsed)"
done

echo "❌  Timed out after ${TIMEOUT}s — partial result:"
curl -sf "$BASE_URL/test-result" | jq '.' || echo "(no result)"
exit 1
