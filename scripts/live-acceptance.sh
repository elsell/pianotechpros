#!/usr/bin/env bash
set -euo pipefail
app_dir="${1:?generated app directory is required}"
cd "$app_dir"
export COMPOSE_FILE=compose.yaml:compose.acceptance.yaml
lock_dir="${TMPDIR:-/tmp}/pianotechpros-live-acceptance.lock"
for _ in $(seq 1 1200); do
  if mkdir "$lock_dir" 2>/dev/null; then printf '%s\n' "$$" > "$lock_dir/pid"; acquired=1; break; fi
  lock_pid="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  if [[ -n "$lock_pid" ]] && ! kill -0 "$lock_pid" 2>/dev/null; then rm -rf "$lock_dir"; continue; fi
  sleep 1
done
[[ -n "${acquired:-}" ]] || { echo "timed out waiting for the live acceptance port lock" >&2; exit 1; }
export MAKE_APP_UID="${MAKE_APP_UID:-$(id -u)}" MAKE_APP_GID="${MAKE_APP_GID:-$(id -g)}"
export COMPOSE_PROJECT_NAME="make-app-acceptance-${MAKE_APP_ACCEPTANCE_RUN_ID:-$$}"
export PIANOTECHPROS_ACCOUNT_PROVISIONING_MODE=existing
export PIANOTECHPROS_ACCOUNT_INVITED_EMAILS=developer@example.com,second@example.com
cleanup() { status=$?; if [[ "$status" -ne 0 ]]; then docker compose ps -a >&2 || true; docker compose logs --tail=200 >&2 || true; fi; docker compose down --volumes --remove-orphans --rmi local >/dev/null 2>&1 || true; rm -rf "$lock_dir"; return "$status"; }
trap cleanup EXIT

docker compose down --volumes --remove-orphans >/dev/null 2>&1 || true
./scripts/start-postgres-for-acceptance.sh
docker compose run --rm --build app-migrate
docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U app_migrator -d postgres -c 'CREATE DATABASE dealer_acceptance OWNER app_migrator'
docker compose run --rm -e PIANOTECHPROS_DATABASE_DSN='postgres://app_migrator:app_migrator@postgres:5432/dealer_acceptance?sslmode=disable' app-migrate
bash scripts/dealer-grant-migration-sql.sh | docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U app_migrator -d dealer_acceptance
(cd apps/api && go test ./internal/adapters/gormstore/dealer -database-dsn 'postgres://app_migrator:app_migrator@localhost:5432/dealer_acceptance?sslmode=disable')
(cd apps/api && go test ./internal/adapters/gormstore/customer -database-dsn 'postgres://app_migrator:app_migrator@localhost:5432/dealer_acceptance?sslmode=disable')
(cd apps/api && go test ./internal/adapters/gormstore/technician -database-dsn 'postgres://app_migrator:app_migrator@localhost:5432/dealer_acceptance?sslmode=disable')
(cd apps/api && go test ./internal/bootstrap/inquiry -database-dsn 'postgres://app:app@localhost:5432/dealer_acceptance?sslmode=disable')
docker compose up -d --build spicedb dex api web
for _ in $(seq 1 180); do curl -fsS http://localhost:8080/readyz >/dev/null 2>&1 && curl -fsS http://localhost:5556/dex/.well-known/openid-configuration >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://localhost:8080/healthz >/dev/null
curl -fsS http://localhost:8080/readyz >/dev/null
(cd apps/api && go test ./internal/adapters/spicedb -spicedb-endpoint localhost:50051 -spicedb-token local-development-runtime-change-me -spicedb-insecure)
(cd apps/api && go test ./internal/app/customer -customer-database-dsn 'postgres://app_migrator:app_migrator@localhost:5432/dealer_acceptance?sslmode=disable' -customer-spicedb-endpoint localhost:50051 -customer-spicedb-token local-development-runtime-change-me)
(cd apps/api && go test ./internal/app/technician -technician-database-dsn 'postgres://app_migrator:app_migrator@localhost:5432/dealer_acceptance?sslmode=disable' -technician-spicedb-endpoint localhost:50051 -technician-spicedb-token local-development-runtime-change-me)
for _ in $(seq 1 180); do curl -fsS http://localhost:5173 >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://localhost:5173 >/dev/null

node --test scripts/private-invitation-input.test.mjs
node scripts/web-browser-acceptance.mjs
node scripts/profile-persisted-browser-acceptance.mjs
node scripts/scalar-browser-acceptance.mjs
node scripts/showroom-web-acceptance.mjs
node scripts/crawler-no-origin-acceptance.mjs
pnpm --dir apps/web build
WEB_ACCEPTANCE_BUILT=1 node scripts/showroom-web-acceptance.mjs
WEB_ACCEPTANCE_BUILT=1 node scripts/crawler-no-origin-acceptance.mjs
WEB_ACCEPTANCE_BUILT=1 node scripts/inquiry-web-acceptance.mjs
WEB_ACCEPTANCE_BUILT=1 node scripts/native-inquiry-bridge-acceptance.mjs
WEB_ACCEPTANCE_BUILT=1 node scripts/banner-web-acceptance.mjs
WEB_ACCEPTANCE_BUILT=1 node scripts/customer-web-acceptance.mjs
WEB_ACCEPTANCE_BUILT=1 node scripts/technician-web-acceptance.mjs
node scripts/session-rotation-web-acceptance.mjs
node scripts/voice-recorder-acceptance.mjs
node scripts/dealer-web-suite.mjs
WEB_ACCEPTANCE_BUILT=1 INQUIRY_TEST_TURNSTILE_FAILURE=1 node scripts/inquiry-web-acceptance.mjs

token() {
  curl -fsS -X POST http://localhost:5556/dex/token -d grant_type=password -d "client_id=$1" -d "username=$2" -d password=password -d scope='openid profile email' |
    python3 -c 'import json,sys;print(json.load(sys.stdin)["id_token"])'
}
session() {
  identity_token="$(token "$1" "$2")"
  IDENTITY_TOKEN="$identity_token" python3 -c 'import json,os;print(json.dumps({"identityToken":os.environ["IDENTITY_TOKEN"]}))' |
    curl -fsS -X POST -H 'Content-Type: application/json' --data-binary @- http://localhost:8080/v1/sessions |
    python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["token"])'
}
expect_status() { expected="$1"; shift; actual="$(curl -sS -o /dev/null -w '%{http_code}' "$@")"; [[ "$actual" == "$expected" ]] || { echo "expected HTTP $expected, got $actual: $*" >&2; return 1; }; }

owner_token="$(session pianotechpros-web developer@example.com)"
other_token="$(session pianotechpros-web second@example.com)"
DEALER_ACCEPTANCE_OWNER_SESSION="$owner_token" DEALER_ACCEPTANCE_OTHER_SESSION="$other_token" python3 scripts/dealer-api-acceptance.py
expect_status 401 http://localhost:8080/v1/me
expect_status 401 -H 'Authorization: Bearer malformed' http://localhost:8080/v1/me
me="$(curl -fsS -H "Authorization: Bearer $owner_token" http://localhost:8080/v1/me)"
owner_id="$(printf '%s' "$me" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["id"])')"
curl -fsS -H "Authorization: Bearer $owner_token" http://localhost:8080/v1/audit-events |
  python3 -c 'import json,sys;assert any(e["action"]=="user.viewed" for e in json.load(sys.stdin)["data"])'

curl -fsS http://localhost:8080/openapi.json | python3 -c 'import json,sys;s=json.load(sys.stdin)["components"]["securitySchemes"]["oidc"];assert s["flows"]["authorizationCode"]["x-usePkce"]=="SHA-256"'
curl -fsS http://localhost:8080/docs | grep -q '@scalar/api-reference'
discovery="$(curl -fsS http://localhost:8080/oidc/.well-known/openid-configuration)"
printf '%s' "$discovery" | python3 -c 'import json,sys;d=json.load(sys.stdin);assert d["token_endpoint"]=="http://localhost:8080/oidc/token"'

if docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U app -d app -c 'CREATE TABLE forbidden_runtime_schema_change(id text)'; then
  echo "runtime role changed schema" >&2; exit 1
fi
if docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U app -d app -c 'UPDATE schema_migrations SET dirty=true'; then
  echo "runtime role mutated migration ledger" >&2; exit 1
fi
if docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U app_migrator -d app -c 'TRUNCATE audit_event_models'; then
  echo "database owner bypassed append-only audit guard" >&2; exit 1
fi
docker compose exec -T postgres psql -At -U app -d app -v "owner_id=$owner_id" <<'AUDIT_SQL' | grep -Eq '^[1-9][0-9]*$'
SELECT count(*) FROM audit_event_models WHERE owner_user_id=:'owner_id' AND action='user.viewed';
AUDIT_SQL

docker compose stop spicedb
expect_status 503 http://localhost:8080/readyz
expect_status 204 http://localhost:8080/livez
docker compose start spicedb
for _ in $(seq 1 60); do curl -fsS http://localhost:8080/readyz >/dev/null 2>&1 && break; sleep 1; done
echo "blank-app authentication, OIDC, audit, role, and health acceptance passed"
