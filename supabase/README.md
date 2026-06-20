# Supabase setup — Loop by Zak Cricket

Everything you need to stand up the database, create test users for the three
roles, and (later) enable real AI. Two paths: the **CLI** (recommended) or the
**dashboard** (no install). Project ref: `qdsymhyfknagjpnggetk`.

```
supabase/
  migrations/          schema → RLS → seed  (apply in this order)
    0001_schema.sql
    0002_rls.sql
    0003_seed.sql
  seed_demo_users.sql  one-off bootstrap: academy + role users + demo data
  functions/
    generate-report/   AI edge function (only needed when you go live with AI)
```

---

## Option A — Supabase CLI (recommended)

### 1. Install + log in
```bash
npm install -g supabase        # or: brew install supabase/tap/supabase
supabase login                 # opens the browser
```

### 2. Link this repo to your project
Run from the repo root (the folder with `supabase/`):
```bash
supabase link --project-ref qdsymhyfknagjpnggetk
```
It will ask for your **database password** (Dashboard → Project Settings →
Database → Database password; reset it there if you don't have it).

### 3. Push the migrations
```bash
supabase db push
```
This applies `0001 → 0002 → 0003` in order.
> If the CLI complains about migration version format, it wants 14-digit
> timestamp prefixes. Easiest fix: skip the CLI for migrations and paste the
> three files into the SQL editor (Option B, step 1). Everything else here
> still works via the CLI.

### 4. Create the three test users
Dashboard → **Authentication → Users → Add user** (do this 3×), ticking
**"Auto Confirm User"** each time:
- `admin@zakcricket.ae`
- `head@zakcricket.ae`
- `coach@zakcricket.ae`

(There's no CLI command to create auth users with passwords; the dashboard is
the quickest way.)

### 5. Run the bootstrap
Dashboard → SQL Editor → paste and run `supabase/seed_demo_users.sql`.
Links each user to an academy with their role and adds demo groups/players.

### 6. (Later) Enable real AI
Only when you're ready to leave free placeholder mode:
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase functions deploy generate-report
```
Then flip `USE_REAL_AI` to `true` in `src/lib/ai.ts`. Nothing else changes.

---

## Option B — Dashboard only (no install)

1. **Migrations** — SQL Editor → New query → paste the **entire** contents of
   `0001_schema.sql`, Run. Repeat for `0002_rls.sql`, then `0003_seed.sql`.
   (Order matters.)
2. **Users** — same as Option A step 4.
3. **Bootstrap** — same as Option A step 5.

---

## Run the app

In the repo root, create `.env.local`:
```dotenv
VITE_SUPABASE_URL=https://qdsymhyfknagjpnggetk.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon key from Project Settings → API>
```
Then:
```bash
npm install
npm run dev      # http://localhost:5173
```

Sign in with any of the three users — each lands on its own destination:

| Email | Role | Destination |
|---|---|---|
| `admin@zakcricket.ae` | Admin | `/admin` — full ops + finance |
| `head@zakcricket.ae` | Head Coach | `/head-coach` — development oversight, no finance |
| `coach@zakcricket.ae` | Coach | `/coach` — own groups, attendance, AI reports, matches |

AI features run in **free placeholder mode** — no Anthropic key required.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Invalid login credentials" | User not confirmed → re-add with **Auto Confirm User**, or disable email confirmations (Auth → Providers → Email). |
| Logs in but redirects back to login / blank | No `profiles` row → run `seed_demo_users.sql`. Confirm the user's email matches one in the script. |
| Screens empty | Demo data didn't load → re-run `seed_demo_users.sql` (it's idempotent). |
| `relation "..." does not exist` on bootstrap | Migrations not applied yet → do the migrations step first. |
| RLS "permission denied" errors | Make sure `0002_rls.sql` ran (it defines the `public.user_academy_id()` helper the policies depend on). |
