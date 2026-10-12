#!/bin/sh
# Run a command with TEST_DATABASE_URL pointing at a throwaway postgres:17-alpine container,
# then remove the container. Usage: sh with-test-postgres.sh vitest run
set -eu

name="civicsignal-test-pg-$$"
password="test-$$"

docker run --rm -d --name "$name" -e POSTGRES_PASSWORD="$password" -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT INT TERM

port=$(docker port "$name" 5432/tcp | head -n1 | sed 's/.*://')

tries=0
until docker exec "$name" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -gt 60 ]; then
    echo "postgres did not become ready" >&2
    exit 1
  fi
  sleep 1
done

TEST_DATABASE_URL="postgresql://postgres:${password}@127.0.0.1:${port}/postgres" "$@"
