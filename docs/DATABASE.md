# Database: making it rebuildable

**The problem.** The base tables (`documents`, `vendors`, `funds`, ...) and the `receipts` storage bucket were
created by hand in the Supabase dashboard. The files in `supabase/migrations` only contain changes made
*after* that, so they cannot build a database from nothing. The fix is to export the live schema once and make
it the first migration.

You need the Supabase CLI, `supabase init` run once (creates `supabase/config.toml`, commit it) and
`supabase link --project-ref <ref>`. Database password: Supabase dashboard > Project Settings > Database.
Use `export SUPABASE_DB_PASSWORD=...` in your shell. Never commit it.

## Step 0: make sure every migration is applied to the live database

Run `supabase migration list` and look at the Local and Remote columns.

* **Remote column filled in** (you have been using `supabase db push`): run `supabase db push` and move on.
* **Remote column empty or out of sync** (you pasted SQL into the dashboard by hand): do NOT run
  `db push`, it would try to re-run old migrations. Instead check the newest ones in the SQL editor:

  ```sql
  select column_name from information_schema.columns where table_name = 'documents' and column_name = 'paid_date';
  select column_name from information_schema.columns where table_name = 'funds' and column_name = 'archived_at';
  select to_regproc('public.dashboard_summary');
  ```

  Any query that returns nothing means that migration is missing: paste its file from
  `supabase/migrations` into the SQL editor and run it.
* If the two columns have **no rows in common** (every row has only a Local or only a Remote value), the
  database history and the files in this repo were created separately. That is exactly the situation this
  procedure fixes. Do not run `db push`; run the four files by hand as above.
* `20261116150000_ensure_receipts_bucket.sql` is safe either way (the bucket already exists, it only makes sure
  it is private).

## Step 1: export the schema (read only)

```bash
export SUPABASE_DB_PASSWORD='...'
./scripts/dump-schema.sh
```

This writes `supabase/baseline/schema.sql` and checks that the app's tables are in it. Open the file and skim it.
Commit it.

## Step 2: make it the first migration

```bash
./scripts/make-baseline.sh
```

It moves the old migrations into `supabase/migrations_archive/` and creates
`supabase/migrations/20261116140000_baseline_schema.sql`. It only changes files in the repo. At the end it prints
two `supabase migration repair` commands. Run them: they only update Supabase's list of "already applied"
migrations so the live database does not try to run the baseline. Your data and schema are not touched.

## Step 3: check it worked

```bash
supabase start                 # needs Docker
supabase db reset              # builds a brand new local database from the migrations
                               # NEVER add --remote or --linked to db reset: that would erase the live database
supabase db diff --remote      # use --linked on older CLI versions; should say there are no schema changes
supabase migration list        # Local and Remote should now match
```

If `db reset` fails or the diff shows changes, do not push anything; send me the output.

## Running the app locally

The old "dev mode" that skipped login and pretended to be an admin has been removed, so local development uses a
real (local) user:

1. `supabase start`, then `supabase db reset`.
2. Put the local API URL and keys from `supabase status` into `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
3. Run `npm run dev`, sign up on `/login`, then finish onboarding. Local confirmation emails appear in the
   Inbucket inbox (the URL is shown by `supabase status`).

## Adding migrations from now on

`supabase migration new <name>`, write the SQL, test with `supabase db reset`, then `supabase db push`.
Do not change the database by hand in the dashboard any more, or the repo will drift again.
