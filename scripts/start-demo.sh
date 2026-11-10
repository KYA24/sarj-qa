#!/usr/bin/env bash
set -euo pipefail
export DOTNET_PROCESSOR_COUNT="${DOTNET_PROCESSOR_COUNT:-2}"
source "$(dirname "$0")/env.sh"
cd "$NUZUL_ROOT"
if [ -f .demo-config.env ]; then set -a; source .demo-config.env; set +a; fi
unset SARJ_DATABASE_URL SARJ_GOOGLE_CLIENT_ID SARJ_GOOGLE_CLIENT_SECRET SARJ_OWNER_EMAIL SARJ_PROTECTION_KEYRING NUZUL_STUDIO_KEY SARJ_PUBLIC_ORIGIN
export SARJ_AUTH_MODE=demo
export SARJ_HOSTING_MODE=demo
export NUZUL_API_URL="http://127.0.0.1:${SARJ_DEMO_PORT:-5288}"
export NUZUL_FIXTURE_ORIGIN="http://127.0.0.1:${SARJ_DEMO_FIXTURE_PORT:-5290}"
export FIXTURE_PORT="${SARJ_DEMO_FIXTURE_PORT:-5290}"
export NUZUL_DATA_DIR="$NUZUL_ROOT/.demo-data"
export NUZUL_DART_PATH="$(command -v dart)"
export ASPNETCORE_WEBROOT="$NUZUL_ROOT/frontend/dist"
# Optional endpoint sends only the sources the user explicitly asks AI to analyze.
export SARJ_DEMO_AI_URL="${SARJ_DEMO_AI_URL:-https://sarj-qa-free-ai.moknah-erp.workers.dev/v1/chat/completions}"
mkdir -p .demo-data
chmod 700 .demo-data
node fixtures/server.mjs > .demo-data/fixture.log 2>&1 & fixture_pid=$!
dotnet run --project backend -c Release --no-build > .demo-data/backend.log 2>&1 & api_pid=$!
cleanup() { kill "$fixture_pid" "$api_pid" 2>/dev/null || true; }
trap cleanup EXIT
trap 'exit 0' INT TERM
for attempt in $(seq 1 100); do
 if curl -fsS "$NUZUL_API_URL/api/health" >/dev/null 2>&1; then
  printf '\nSarj local demo: %s\nNo login. Data stays in .demo-data, separate from any owner workspace.\nCtrl+C stops only this demo.\n' "$NUZUL_API_URL"
  wait -n "$fixture_pid" "$api_pid"
  exit
 fi
 sleep 0.2
done
printf 'Demo did not start. Inspect .demo-data/backend.log\n' >&2
exit 1
