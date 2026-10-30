#!/usr/bin/env bash
# Disposable real services for native acceptance. No production configuration.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
tools="${1:?absolute native service installation required}"; shift
[[ "$tools" == /* && $# -gt 0 ]] || exit 1
identity_port="${NATIVE_ACCEPTANCE_IDENTITY_PORT:-18082}"
api_port="${NATIVE_ACCEPTANCE_API_PORT:-18083}"
for port in "$identity_port" "$api_port"; do
  [[ "$port" =~ ^[0-9]{4,5}$ ]] && (( port >= 1024 && port <= 65535 )) || exit 1
done
[[ "$identity_port" != "$api_port" ]] || exit 1
export NATIVE_ACCEPTANCE_IDENTITY_PORT="$identity_port" NATIVE_ACCEPTANCE_API_PORT="$api_port"
evidence="$root/build/ios-ui-evidence/real-services"
mkdir -p "$evidence"
work="$(mktemp -d "${TMPDIR:-/tmp}/piano-native-data.XXXXXX")"
pids=()
cleanup() {
  local status=$?
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  "$tools/bin/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work"
  return "$status"
}
trap cleanup EXIT
"$tools/bin/postgres" --version | tee "$evidence/postgres-version.txt" | grep -Fx 'postgres (PostgreSQL) 18.4'
"$tools/bin/spicedb" version > "$evidence/spicedb-version.txt"
grep -F 'v1.54.0' "$evidence/spicedb-version.txt"
mkdir "$work/bin"
(cd apps/api && go build -o "$work/bin/" ./cmd/server ./cmd/migrate ./cmd/schema ./cmd/spicedb-runtime-proxy)
printf '%s\n' app_migrator > "$work/password"
"$tools/bin/initdb" -D "$work/data" -U app_migrator --pwfile="$work/password" --auth-local=trust --auth-host=scram-sha-256 --no-locale > "$evidence/initdb.log"
"$tools/bin/pg_ctl" -D "$work/data" -l "$evidence/postgres.log" -o "-h 127.0.0.1 -p 15432 -k $work" -w start
export PGPASSWORD=app_migrator
"$tools/bin/createdb" -h 127.0.0.1 -p 15432 -U app_migrator app
"$tools/bin/psql" -h 127.0.0.1 -p 15432 -U app_migrator -d app -v ON_ERROR_STOP=1 -f deploy/postgres/init/001-databases.sql
export PIANOTECHPROS_DATABASE_INSECURE=true PIANOTECHPROS_OIDC_INSECURE=true PIANOTECHPROS_SPICEDB_INSECURE=true
PIANOTECHPROS_DATABASE_DSN='postgres://app_migrator:app_migrator@127.0.0.1:15432/app?sslmode=disable' "$work/bin/migrate" > "$evidence/migrate.log" 2>&1
spice_dsn='postgres://spicedb:spicedb@127.0.0.1:15432/spicedb?sslmode=disable'
"$tools/bin/spicedb" datastore migrate head --datastore-engine postgres --datastore-conn-uri "$spice_dsn" > "$evidence/spicedb-migrate.log" 2>&1
"$tools/bin/spicedb" serve --datastore-engine postgres --datastore-conn-uri "$spice_dsn" --grpc-preshared-key native-acceptance-schema --grpc-addr 127.0.0.1:15052 --metrics-addr 127.0.0.1:19090 --telemetry-endpoint="" > "$evidence/spicedb.log" 2>&1 &
pids+=("$!")
PIANOTECHPROS_SPICEDB_ENDPOINT=127.0.0.1:15052 PIANOTECHPROS_SPICEDB_SCHEMA_TOKEN=native-acceptance-schema "$work/bin/schema" > "$evidence/schema.log" 2>&1
PIANOTECHPROS_SPICEDB_PROXY_ADDR=127.0.0.1:15051 PIANOTECHPROS_SPICEDB_UPSTREAM_ENDPOINT=127.0.0.1:15052 PIANOTECHPROS_SPICEDB_SCHEMA_TOKEN=native-acceptance-schema PIANOTECHPROS_SPICEDB_TOKEN=native-acceptance-runtime "$work/bin/spicedb-runtime-proxy" > "$evidence/proxy.log" 2>&1 &
pids+=("$!")
node scripts/run-native-ui-fixture.mjs "$identity_port" "http://127.0.0.1:$api_port" > "$evidence/identity.log" 2>&1 &
pids+=("$!")
ready() {
  for _ in {1..90}; do
    for pid in "${pids[@]}"; do kill -0 "$pid" || return 1; done
    if curl --fail --silent --connect-timeout 2 --max-time 3 "$1" >/dev/null; then return 0; fi
    sleep 1
  done
  return 1
}
ready "http://127.0.0.1:$identity_port/oidc/.well-known/openid-configuration"
env -i PATH="$PATH" HOME="$HOME" \
  PIANOTECHPROS_HTTP_ADDR="127.0.0.1:$api_port" PIANOTECHPROS_PUBLIC_BASE_URL="http://127.0.0.1:$api_port" \
  PIANOTECHPROS_DATABASE_DSN='postgres://app:app@127.0.0.1:15432/app?sslmode=disable' PIANOTECHPROS_DATABASE_INSECURE=true \
  PIANOTECHPROS_CURSOR_SIGNING_KEY=local-development-cursor-signing-key-change-me \
  PIANOTECHPROS_METRICS_BEARER_TOKEN=local-development-metrics-token-change-me \
  PIANOTECHPROS_OIDC_ISSUER="http://127.0.0.1:$identity_port/oidc" PIANOTECHPROS_OIDC_AUDIENCES=pianotechpros-mobile PIANOTECHPROS_OIDC_INSECURE=true \
  PIANOTECHPROS_SCALAR_DOCS_DISABLED=true PIANOTECHPROS_ACCOUNT_PROVISIONING_MODE=open \
  PIANOTECHPROS_SPICEDB_ENDPOINT=127.0.0.1:15051 PIANOTECHPROS_SPICEDB_TOKEN=native-acceptance-runtime PIANOTECHPROS_SPICEDB_INSECURE=true \
  "$work/bin/server" > "$evidence/api.log" 2>&1 &
pids+=("$!")
ready "http://127.0.0.1:$api_port/readyz"
"$@"
