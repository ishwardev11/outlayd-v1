#!/usr/bin/env bash
#
# Export the live database schema into the repo (step 1 of making the database rebuildable).
#
# Read-only: it only READS from the linked Supabase project and writes supabase/baseline/schema.sql.
# Nothing in supabase/migrations is touched. See docs/DATABASE.md for the full procedure.
#
# Needs: the Supabase CLI, `supabase link --project-ref <ref>` done once, and the database password
# (export SUPABASE_DB_PASSWORD=... or the CLI will prompt for it).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v supabase >/dev/null 2>&1; then
  echo "The Supabase CLI is not installed: https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

if [ ! -f supabase/config.toml ]; then
  echo "supabase/config.toml is missing. Run 'supabase init', then 'supabase link --project-ref <your-ref>'." >&2
  exit 1
fi

# Newer CLI versions call the flag --remote, older ones --linked
if supabase db dump --help 2>&1 | grep -q -- "--remote"; then TARGET="--remote"; else TARGET="--linked"; fi

mkdir -p supabase/baseline
OUT="supabase/baseline/schema.sql"

echo "Dumping the public schema of the linked project to $OUT ..."
supabase db dump "$TARGET" --schema public -f "$OUT"

echo
echo "Checking that the tables the app relies on are in the dump:"
missing=0
for table in organizations user_roles workspace_invites documents vendors categories funds procurement_projects quotes; do
  if grep -qiE "CREATE TABLE (IF NOT EXISTS )?\"?public\"?\.\"?${table}\"?" "$OUT"; then
    echo "  ok       $table"
  else
    echo "  MISSING  $table"
    missing=1
  fi
done

if [ "$missing" -ne 0 ]; then
  echo
  echo "Some tables are missing from the dump. Do not continue; check the project link and password." >&2
  exit 1
fi

echo
echo "Done. Next: review $OUT, commit it, then follow 'Step 2' in docs/DATABASE.md."
