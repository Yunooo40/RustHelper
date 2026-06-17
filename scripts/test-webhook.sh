#!/usr/bin/env bash
# Sends a sample Rust event to the local API (Linux/macOS, for the deploy box).
#   ./scripts/test-webhook.sh
# Optional env: API_BASE (default http://localhost:3000), WEBHOOK_SECRET.
set -euo pipefail

BASE="${API_BASE:-http://localhost:3000}"
SECRET="${WEBHOOK_SECRET:-}"
NOW="$(date +%s)"

curl -sS -X POST "$BASE/webhook/rust" \
  -H 'Content-Type: application/json' \
  ${SECRET:+-H "x-webhook-secret: $SECRET"} \
  -d "{
    \"server\": \"Atlas - EU 2X Medium\",
    \"event\": \"oil_rig_small\",
    \"status\": \"spawned\",
    \"spawn_time\": ${NOW},
    \"next_respawn\": $((NOW + 1800)),
    \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
  }" | (jq . 2>/dev/null || cat)
echo
