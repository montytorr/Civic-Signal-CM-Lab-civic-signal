#!/usr/bin/env bash
# Deploy the checked-out revision on clawdius: test, build, migrate, start,
# health-check. The deploy workflow checks the revision out and tees this
# script's output; its last line is always a one-line summary.
set -euo pipefail

APP_DIR=${APP_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
cd "$APP_DIR"

ENV_FILE=${CIVICSIGNAL_ENV_FILE:-/home/runner/civicsignal-secrets/web.env}
export CIVICSIGNAL_ENV_FILE=$ENV_FILE

sha=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
step=setup
trap 'echo "civicsignal deploy failed at ${step} (${sha})"' ERR

# The env file is handed to compose, never sourced: values such as EMAIL_FROM
# hold spaces and angle brackets. Check the contract without printing values.
if [ ! -r "$ENV_FILE" ]; then
  echo "Missing or unreadable env file: $ENV_FILE" >&2
  false
fi
for key in DATABASE_URL SESSION_SECRET EMAIL_FROM APP_URL; do
  if ! grep -Eq "^${key}=.+" "$ENV_FILE"; then
    echo "$ENV_FILE has no value for $key" >&2
    false
  fi
done
if ! grep -Eq '^RESEND_API_KEY=.+' "$ENV_FILE"; then
  echo "warning: RESEND_API_KEY is empty; verification and reset email are off" >&2
fi
# Compose interpolates the public site URL build argument from APP_URL.
APP_URL=$(grep -E '^APP_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2-)
export APP_URL

for network in clawdius-data trading-v2-network; do
  if ! docker network inspect "$network" >/dev/null 2>&1; then
    echo "Missing external Docker network: $network" >&2
    false
  fi
done

# Keep Docker COPY happy even if no static public assets have landed yet.
mkdir -p apps/web/public
[ -e apps/web/public/.gitkeep ] || touch apps/web/public/.gitkeep

# Node 25+ no longer bundles corepack: run the pnpm that package.json pins.
pnpm_version=$(node -p "require('./package.json').packageManager.split('@')[1]")
pnpm() { npx --yes "pnpm@${pnpm_version}" "$@"; }

step=test
pnpm install --frozen-lockfile
pnpm -r test

step=build
docker compose build web resolver

# The migrate service runs the resolver image built above, on clawdius-data,
# as the app role from DATABASE_URL.
step=migrate
echo "Applying CivicSignal database migrations"
docker compose --profile tools run --rm migrate

step=start
docker compose up -d --remove-orphans web resolver

step=health
healthy=false
for _ in $(seq 1 30); do
  state=$(docker inspect civicsignal-web --format '{{.State.Health.Status}}' 2>/dev/null || echo starting)
  if [ "$state" = healthy ] \
    || docker exec civicsignal-web wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health 2>/dev/null; then
    healthy=true
    break
  fi
  sleep 4
done
if [ "$healthy" != true ]; then
  docker logs --tail=100 civicsignal-web >&2 || true
  false
fi

resolver_state=$(docker inspect civicsignal-resolver --format '{{.State.Status}}' 2>/dev/null || echo missing)
if [ "$resolver_state" != running ]; then
  echo "civicsignal-resolver is $resolver_state" >&2
  docker logs --tail=60 civicsignal-resolver >&2 || true
  false
fi

trap - ERR
echo "civicsignal deployed ${sha}: web healthy, resolver running, migrations applied"
