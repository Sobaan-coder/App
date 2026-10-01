#!/usr/bin/env bash
# Applies all migrations to a throw-away PostgreSQL database and runs the SQL
# security/business-logic test-suite in supabase/tests.
#
#   PGHOST/PGUSER/PGPASSWORD/PGPORT  -> connection to a Postgres 15+ server
#   ./scripts/test_db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-businesspilot_test}"
PSQL="psql -v ON_ERROR_STOP=1 -q -X"

$PSQL -d postgres -c "drop database if exists $DB" >/dev/null
$PSQL -d postgres -c "create database $DB" >/dev/null

echo "→ supabase stubs"
$PSQL -d "$DB" -f supabase/tests/00_supabase_stubs.sql >/dev/null
for f in supabase/migrations/*.sql; do
  echo "→ migration $(basename "$f")"
  $PSQL -d "$DB" -f "$f" >/dev/null
done
for f in supabase/tests/[1-9]*.sql; do
  echo "→ test $(basename "$f")"
  $PSQL -d "$DB" -f "$f"
done
echo "✓ database tests passed"
