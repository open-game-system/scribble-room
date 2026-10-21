#!/bin/zsh
# Seam tests against their own wrangler dev (port 8872, own state) that trusts the test OGS key set.
set -euo pipefail
cd "${0:A:h}/.."
PORT=${SEAM_PORT:-8872}
export OGS_JWKS_PORT=8873
pnpm build:client >/dev/null
mkdir -p .wrangler
pnpm exec wrangler dev --port $PORT --persist-to .wrangler/seam-state \
  --var OGS_JWKS_URL:http://localhost:8873/.well-known/jwks.json --var ALLOW_SEED:1 > .wrangler/seam-dev.log 2>&1 &
DEV=$!
trap 'kill $DEV 2>/dev/null' EXIT
for i in {1..80}; do curl -s -o /dev/null "http://localhost:$PORT/favicon.svg" && break; sleep 0.5; done
GAME_URL=http://localhost:$PORT pnpm exec vitest run --config vitest.seam.config.ts "$@"
