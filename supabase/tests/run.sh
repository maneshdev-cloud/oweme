#!/usr/bin/env bash
# =============================================================================
# OweMe — runs the whole migration + test suite against a scratch database.
#
#   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/oweme_test \
#     bash supabase/tests/run.sh
#
# The database is dropped and rebuilt from the migrations every time, so this is
# safe to run repeatedly — but only ever point it at a throwaway database.
# =============================================================================
set -euo pipefail

: "${DATABASE_URL:?set DATABASE_URL, e.g. postgresql://postgres:postgres@127.0.0.1:5432/oweme_test}"

PSQL=(psql "$DATABASE_URL" -X -q -v ON_ERROR_STOP=1)
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
cd "$ROOT"
OUT="$(mktemp)"

reset_db() {
  "${PSQL[@]}" -c "drop schema if exists public cascade; create schema public;" \
                 -c "drop schema if exists auth cascade;" \
                 -c "drop schema if exists tests cascade;" >/dev/null
  "${PSQL[@]}" -f supabase/tests/_bootstrap.sql >/dev/null
  "${PSQL[@]}" -f supabase/tests/_helpers.sql >/dev/null
}

run() {
  local file="$1"
  printf '→ %s … ' "$file"
  reset_db
  if "${PSQL[@]}" -f "supabase/tests/$file" >"$OUT" 2>&1; then
    printf '%s assertions passed\n' "$(grep -c '  ok ' "$OUT" || true)"
  else
    printf 'FAILED\n\n'
    grep -E 'FAILED|ERROR' "$OUT" | head -10
    exit 1
  fi
}

run 01_domain_test.sql
run 02_rls_test.sql

echo ""
echo "════════════════════════════════════════"
echo " all database tests passed"
echo "════════════════════════════════════════"
