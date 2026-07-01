# HRSync — Postgres Migration Guide

This is HRSync rebuilt to use **Postgres (via Supabase)** instead of the old
lowdb JSON file. Same features, same login system, same frontend — nothing
the frontend HTML files need to change. The only difference is *where the
data lives*: in a real, permanent database instead of a file on disk that
could be wiped on every server restart.

---

## What changed

- `src/config/db.js` — now connects to Postgres instead of reading `data/db.json`
- Every controller (`authController.js`, `employeeController.js`, `leaveController.js`,
  `recruitmentController.js`) and `subscriptionGate.js` — rewritten to use SQL
  queries instead of lowdb's in-memory array syntax
- `setup.js` — now seeds your demo data (HR-001, EMP-001, demo recruitment key,
  default policies) directly into Postgres
- New: `src/config/schema.sql` — the full table definitions
- New: `migrate.js` — a one-time script that creates all the tables
- `package.json` — removed `lowdb`, added `pg` (the Postgres driver)

**Nothing else changed.** All your frontend HTML files (`admin.html`,
`hr-dashboard.html`, `employee-portal.html`, `recruit-portal.html`,
`super-admin (1).html`, `index.html`) work exactly as before — they talk to
the same API endpoints, with the same request/response shapes.

---

## Step 1 — Create a free Supabase project

1. Go to **supabase.com** → sign up (GitHub login is fastest)
2. Click **New Project**
3. Give it a name like `hrsync-prod`
4. Set a strong database password — **write this down**, you'll need it
5. Choose the region closest to Uganda (Europe usually has the lowest latency)
6. Wait ~2 minutes for the project to finish provisioning

## Step 2 — Get your connection string

1. In your Supabase project, go to **Project Settings** (gear icon) → **Database**
2. Scroll to **Connection string** → select **URI**
3. Copy it — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```
4. Replace `[YOUR-PASSWORD]` with the actual database password you set in Step 1

## Step 3 — Add it to your `.env` file   Cm020%40122q.

Open `.env` in this project and paste your connection string:

```
DATABASE_URL=postgresql://postgres:your_real_password@db.xxxxxxxxxxxx.supabase.co:5432/postgres
```

(The `JWT_SECRET` is already filled in from your old setup — no change needed there.)

## Step 4 — Install dependencies

```bash
cd hrsync_migrated
npm install
```

This installs `pg` (Postgres driver) along with everything else. `lowdb` is
no longer needed and has been removed from `package.json`.

## Step 5 — Create the database tables

```bash
node migrate.js
```

You should see:
```
🚀 Running HRSync schema migration...
✅ Schema applied successfully — all tables and indexes are ready.
```

This is safe to run more than once — every statement only creates a table if
it doesn't already exist.

## Step 6 — Seed your demo data

```bash
node setup.js
```

This recreates the same demo accounts you had before:
- HR Admin: `HR-001` / `admin123`
- Employee: `EMP-001` / `emp123` (Sarah Nakato)
- Demo recruitment key: `RCT-2026-OPS-DEMO`
- Default policies (Zero Tolerance, Leave Policy)

Also safe to re-run — it checks for existing data first.

## Step 7 — Run it

```bash
node server.js
```

Open `http://localhost:5000` and log in with `HR-001` / `admin123` exactly
like before. Everything should work identically — but now your data survives
server restarts, redeploys, and crashes.

---

## Verifying the migration worked

In Supabase, go to **Table Editor** in the left sidebar — you should see all
14 tables listed (`users`, `employees`, `leave_requests`, etc.) with your
seeded demo data inside them. You can browse and even edit rows directly
there if you ever need to.

---

## Deploying to Render after this

Now that data lives in Postgres instead of local disk, **Render's free tier
becomes safe to use** for real demos — no more risk of losing data when the
service restarts. The only remaining free-tier limitation is the 30–60
second "cold start" delay after 15 minutes of inactivity, which is a minor
UX thing, not a data-loss risk.

When you set up the Render Web Service, add these Environment Variables
(matching your `.env`):
- `DATABASE_URL` — your Supabase connection string
- `JWT_SECRET` — same value as your local `.env`

You do **not** need to add `PORT` — Render sets that automatically.

---

## What about file uploads (employee documents, profile photos)?

Those still save to the local `uploads/` folder via multer, same as before —
that part wasn't changed in this migration. On Render's free tier, uploaded
files will still be lost on restart, same caveat as before. If document
uploads become something real clients depend on, the next upgrade after this
one would be moving file storage to **Supabase Storage** (also free tier
available) — a natural next step, not needed today.

---

## Questions or something breaks?

Most likely causes if something doesn't work:
1. `DATABASE_URL` not set correctly in `.env` — double check the password
   was substituted in correctly with no extra spaces
2. Forgot to run `node migrate.js` before `node setup.js`
3. Supabase project still provisioning — wait a minute and retry

Sovereign Civic Tech 🇺🇬
