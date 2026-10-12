#!/usr/bin/env bash
# Write CivicSignal's runtime env file on clawdius, idempotently. Run with sudo.
#
#   sudo scripts/host/write-web-env.sh
#
# Rewrites /home/runner/civicsignal-secrets/web.env from what is already in it:
# existing values (the DATABASE_URL password, SESSION_SECRET, RESEND_API_KEY...)
# are kept, and only missing ones are generated. Values are written unquoted, so
# `docker run --env-file` and compose read them alike. Never prints a secret.
#
# The database follows the clawdius-postgres convention: database <app>, owned
# by a login role <app>_app (no superuser), with CONNECT revoked from PUBLIC.
# They are created when missing; an existing role's password is left alone
# unless DATABASE_URL has to be generated, in which case it is set to match.
#
# Optional environment:
#   RESEND_API_KEY  used only when the file has none (else it is left empty)
#   PG_CONTAINER    default clawdius-postgres
set -euo pipefail

SECRETS_DIR=/home/runner/civicsignal-secrets
ENV_FILE=$SECRETS_DIR/web.env
OWNER=runner
PG_CONTAINER=${PG_CONTAINER:-clawdius-postgres}
DB_NAME=civicsignal
DB_ROLE=civicsignal_app
DEFAULT_EMAIL_FROM='CivicSignal <noreply@montytorr.com>'
DEFAULT_APP_URL=https://civicsignal.montytorr.com

if [ "$(id -u)" != 0 ]; then
  echo "run with sudo" >&2
  exit 1
fi
umask 077

# Read KEY=VALUE lines without sourcing; strip one pair of surrounding quotes.
declare -A env=()
order=()
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
    key=${BASH_REMATCH[1]}
    value=${BASH_REMATCH[2]}
    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
      value=${BASH_REMATCH[1]}
    fi
    [ -n "${env[$key]+set}" ] || order+=("$key")
    env[$key]=$value
  done < "$ENV_FILE"
fi

psql_admin() {
  docker exec -i "$PG_CONTAINER" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -Atq "$@"
}

role_exists=$(psql_admin -c "SELECT count(*) FROM pg_roles WHERE rolname = '$DB_ROLE'")
db_exists=$(psql_admin -c "SELECT count(*) FROM pg_database WHERE datname = '$DB_NAME'")

set_password=false
if [ -z "${env[DATABASE_URL]:-}" ]; then
  db_password=$(openssl rand -hex 32)
  env[DATABASE_URL]="postgresql://${DB_ROLE}:${db_password}@${PG_CONTAINER}:5432/${DB_NAME}"
  set_password=true
  echo "generated DATABASE_URL"
else
  db_password=$(printf '%s' "${env[DATABASE_URL]}" | sed -E 's#^[a-z]+://[^:]+:([^@]*)@.*#\1#')
fi

if [ "$role_exists" = 0 ]; then
  psql_admin -v pw="$db_password" <<SQL
CREATE ROLE $DB_ROLE LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'pw';
SQL
  echo "created role $DB_ROLE"
elif [ "$set_password" = true ]; then
  psql_admin -v pw="$db_password" <<SQL
ALTER ROLE $DB_ROLE PASSWORD :'pw';
SQL
  echo "set the password of role $DB_ROLE to match the new DATABASE_URL"
fi
if [ "$db_exists" = 0 ]; then
  psql_admin -c "CREATE DATABASE $DB_NAME OWNER $DB_ROLE"
  echo "created database $DB_NAME"
fi
psql_admin -c "ALTER DATABASE $DB_NAME OWNER TO $DB_ROLE" -c "REVOKE CONNECT ON DATABASE $DB_NAME FROM PUBLIC"

if [ -z "${env[SESSION_SECRET]:-}" ]; then
  env[SESSION_SECRET]=$(openssl rand -hex 64)
  echo "generated SESSION_SECRET"
fi
if [ -z "${env[RESEND_API_KEY]:-}" ]; then
  env[RESEND_API_KEY]=${RESEND_API_KEY:-}
  if [ -n "${env[RESEND_API_KEY]}" ]; then
    echo "took RESEND_API_KEY from the environment"
  else
    echo "warning: RESEND_API_KEY is empty; email verification and reset stay off" >&2
  fi
fi
: "${env[EMAIL_FROM]:=$DEFAULT_EMAIL_FROM}"
: "${env[APP_URL]:=$DEFAULT_APP_URL}"
: "${env[NODE_ENV]:=production}"

# The contract first, then anything else the file already carried.
keys=(DATABASE_URL SESSION_SECRET RESEND_API_KEY EMAIL_FROM APP_URL NODE_ENV)
for key in "${order[@]}"; do
  [[ " ${keys[*]} " == *" $key "* ]] || keys+=("$key")
done

install -d -m 700 -o "$OWNER" -g "$OWNER" "$SECRETS_DIR"
tmp=$(mktemp "$SECRETS_DIR/.web.env.XXXXXX")
trap 'rm -f "$tmp"' EXIT
for key in "${keys[@]}"; do
  printf '%s=%s\n' "$key" "${env[$key]}"
done > "$tmp"
chown "$OWNER:$OWNER" "$tmp"
chmod 600 "$tmp"
mv -f "$tmp" "$ENV_FILE"
trap - EXIT
chmod 700 "$SECRETS_DIR"
chown "$OWNER:$OWNER" "$SECRETS_DIR" "$ENV_FILE"

echo "wrote $ENV_FILE ($(stat -c '%a %U:%G' "$ENV_FILE")): ${keys[*]}"
