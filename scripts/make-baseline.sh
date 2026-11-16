#!/usr/bin/env bash
#
# Step 2 of making the database rebuildable: turn supabase/baseline/schema.sql into the first
# migration and archive the old migrations (they assume tables that were created by hand, so they
# cannot run on an empty database).
#
# Only changes files in this repository. It does NOT touch the live database: at the end it prints
# the `supabase migration repair` commands for you to run yourself. See docs/DATABASE.md.
set -euo pipefail
cd "$(dirname "$0")/.."

BASELINE_VERSION="20261116140000" # must be older than 20261116150000_ensure_receipts_bucket.sql
SRC="supabase/baseline/schema.sql"

if [ ! -f "$SRC" ]; then
  echo "Run scripts/dump-schema.sh first." >&2
  exit 1
fi
if ls supabase/migrations/${BASELINE_VERSION}_* >/dev/null 2>&1; then
  echo "A baseline migration already exists. Nothing to do." >&2
  exit 1
fi

echo "This will move every migration older than $BASELINE_VERSION into supabase/migrations_archive/"
echo "and replace them with one baseline migration built from $SRC."
echo
echo "Before continuing, ALL existing migrations must already be applied to the live database"
echo "(otherwise the dump is missing their changes), and $SRC must have been dumped AFTER that."
read -r -p "Is that the case? [y/N] " answer
[ "$answer" = "y" ] || [ "$answer" = "Y" ] || { echo "Cancelled."; exit 1; }

mkdir -p supabase/migrations_archive
versions=()
for f in supabase/migrations/*.sql; do
  name="$(basename "$f")"
  version="${name%%_*}"
  if [[ "$version" < "$BASELINE_VERSION" ]]; then
    if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
      git mv "$f" "supabase/migrations_archive/$name"
    else
      mv "$f" "supabase/migrations_archive/$name"
    fi
    versions+=("$version")
  fi
done

cp "$SRC" "supabase/migrations/${BASELINE_VERSION}_baseline_schema.sql"

if supabase db dump --help 2>&1 | grep -q -- "--remote"; then TARGET="--remote"; else TARGET="--linked"; fi

echo
echo "Archived ${#versions[@]} migrations and created supabase/migrations/${BASELINE_VERSION}_baseline_schema.sql"
echo
echo "Now tell the live database about the new history (this only edits the migration history table,"
echo "it does not change your data or schema). Run these yourself:"
echo
echo "  supabase migration repair $TARGET --status reverted ${versions[*]}"
echo "  supabase migration repair $TARGET --status applied $BASELINE_VERSION"
echo
echo "Then verify as described in 'Step 3' of docs/DATABASE.md."
