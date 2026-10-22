#!/usr/bin/env bash
# Emit a rollback-only migration test for psql -v ON_ERROR_STOP=1.
set -euo pipefail
cd "$(dirname "$0")/.."
printf 'BEGIN;\n'
cat apps/api/internal/adapters/dbmigrations/000020_dealer_grant_confirmation.down.sql
cat apps/api/internal/adapters/dbmigrations/testdata/dealer_grant_fixture.sql
cat apps/api/internal/adapters/dbmigrations/000020_dealer_grant_confirmation.up.sql
cat apps/api/internal/adapters/dbmigrations/testdata/dealer_grant_assertions.sql
printf 'ROLLBACK;\n'
