# Command Dashboard — Duty Tracking with a Rank Hierarchy

An admin dashboard and a constable dashboard for tracking field officers: a
command structure (CP → DCP → ACP → Inspector → Constable) assigns each
constable a location, the constable checks in there with a photo (GPS captured
automatically), and command can see each constable's live location. Shifts run
in a strict relay — a constable can't log out until the next shift's constable
has logged in — so a post is never left unmanned.

**Ranks and access:**

| Rank | Count | Access |
| --- | --- | --- |
| CP | 1 (fixed) | Full visibility and full create/edit/delete, everywhere. |
| DCP | 1 (fixed) | Same as CP. |
| ACP | as many as CP/DCP create | Sees everything CP/DCP sees — every constable, which Inspector runs them, headcounts per Inspector — but **read-only**: no create, edit, or delete. |
| Inspector | as many as CP/DCP create | Manages only their **own** constables (create, edit, delete). Cannot see or touch another Inspector's constables — the API returns 404, not 403, so existence isn't leaked either. |
| Constable / Employee | created by their own Inspector | Self-service only: **Today's Employee Dashboard** — camera + GPS check-in. No admin access at all. |

## Stack

- **Frontend:** React 19 · TypeScript · Vite · Tailwind CSS 4 · react-router-dom · Leaflet / react-leaflet · lucide-react · sonner
- **Backend:** Express (runs as a Vercel serverless function in production) · Supabase (Postgres + Storage) via `@supabase/supabase-js` · multer · bcryptjs

## Getting started

Run both the API and the frontend (two terminals):

```bash
npm run server   # API on http://localhost:4001
npm run dev      # frontend on http://localhost:5174 (proxies /api to 4001)
```

Open http://localhost:5174 and sign in.

Locally, no database is needed — with no Supabase env vars set, the server
keeps everything in memory and **resets on every restart**. That's fine for
quick UI iteration, but it is not the permanent mode described below; if you
want to test real persistence (or the "delete stays deleted" behaviour)
locally, follow the Supabase setup and put the credentials in `.env`
(`cp .env.example .env`) — `npm run server` loads it automatically.

## Deploying to Vercel, with permanent storage via Supabase

Employee records, sessions, and check-in photos live in a Supabase Postgres
project. Data is **permanent**: it survives restarts and redeploys, and the
app never recreates a record on its own. The only way anything disappears is
an admin explicitly using **Delete employee** (permanent, irreversible) or
**Clear history** (wipes a check-in, keeps the account) in the dashboard.

### 1. Create the Supabase project

Go to [supabase.com](https://supabase.com) → **New project**. Pick any name/region
and set a database password (you won't need it for this app — the API talks
to Supabase over REST, not a direct Postgres connection).

### 2. Run the schema

In the Supabase dashboard: **SQL Editor → New query**, paste in the contents
of [`supabase/schema.sql`](supabase/schema.sql) from this repo, and run it.
This creates the `personnel`, `employees`, `sessions`, and `meta` tables, plus
a private `checkin-photos` storage bucket. It's safe to re-run.

> **Already have data from before the rank system?** Don't run `schema.sql`
> against it — that's for a project that's never been seeded. Instead run
> [`supabase/migrate_ranks.sql`](supabase/migrate_ranks.sql) once: it renames
> `admins` → `personnel`, adds the `rank` column (mapping your existing 2
> admin accounts to CP and DCP), and adds `inspector_id` to `employees`. In
> both the SQL Editor, double-check the dropdown next to **Run** says
> **Database**, not **Logs** — picking the wrong one gives a misleading
> generic error instead of running the SQL.

### 3. Get your API keys

**Settings → API** in the Supabase dashboard. You need two values:
- **Project URL** → this is `SUPABASE_URL`
- **service_role secret** (not the `anon`/`public` key) → this is
  `SUPABASE_SERVICE_ROLE_KEY`

The service_role key bypasses Row Level Security, which is why the schema
enables RLS with no policies — only your server (holding this key) can read
or write these tables. **Never** put this key in frontend code or a `VITE_`
env var; it only belongs in the backend's environment.

### 4. Push to GitHub and import to Vercel

```bash
cd ~/Desktop/police-command-dashboard
gh repo create police-command-dashboard --private --source=. --push
```

Then import the repo in Vercel. Build settings come from `vercel.json` — leave
the defaults.

### 5. Set environment variables in Vercel

**Settings → Environment Variables**, add:

| Key | Value |
| --- | --- |
| `SUPABASE_URL` | from step 3 |
| `SUPABASE_SERVICE_ROLE_KEY` | from step 3 |
| `ADMIN_PASSWORD`, `ADMIN2_PASSWORD` | real passwords, not the defaults — these are the CP and DCP logins |

That's it — 4 variables total. ACP, Inspector, and Constable accounts are
**not** configured here; see "Login details" below for how those get created.

See `.env.example` for the full list. Skipping the password vars leaves the
app on the values published in this README — anyone who reads this file can
log in.

### 6. Redeploy

The first request after deploy seeds the CP and DCP accounts into Supabase
(visible in **Table Editor** → `personnel`). From then on, seeding never runs
again for this project — deleting an account is permanent even across future
redeploys.

### Why Supabase and not a file

Vercel runs the API as serverless functions with a **read-only** filesystem,
and consecutive requests may hit different instances. The employee checks in
from their phone; you view it from your laptop — those requests need a store
they both reach, or the admin dashboard just won't show what the employee
submitted.

### Note on GPS

Deployed over HTTPS on a phone, geolocation uses the device's real GPS and is
accurate to roughly 5–20m. On a desktop it falls back to Wi-Fi positioning,
which is far coarser and on macOS often fails outright unless the browser is
enabled under System Settings → Privacy & Security → Location Services.

## Login details

Seeds **2 fixed accounts** (CP and DCP) and **zero ACP/Inspector/Constable
accounts**.

| Rank | Username | Password |
| --- | --- | --- |
| CP | `admin` | `Admin#2026` |
| DCP | `admin2` | `Admin2#2026` |

**Change both of these before any real deployment** via `ADMIN_PASSWORD` /
`ADMIN2_PASSWORD` — the values above are published here and in the repo, so
anyone who reads this file can log in on the defaults.

Everyone else is created from inside the dashboard, not env vars:

1. **ACP or Inspector accounts** — sign in as CP or DCP → **Personnel** →
   **Add personnel**. Pick their rank, name, and a username + password (6+
   characters) right there — that's the real login you hand them.
2. **Constables** — sign in as CP, DCP, *or* an Inspector → **Employees** →
   **Add employee**. An Inspector's new constable is automatically assigned to
   them; CP/DCP can pick which Inspector a constable reports to (or leave it
   unassigned).
3. Tell each person their credentials directly. There's no invite email and no
   self-signup.
4. Assign a constable a shift (morning/afternoon/night) from their detail page
   whenever you want them in the relay — new constables start unassigned.

## How it works

**CP / DCP** — full command view and full control:
- **Employees** (`/admin`) — every constable across every Inspector, their
  on-duty status, shift, assigned location, and which Inspector runs them,
  plus **Add employee** (optionally assigning an Inspector).
- **Personnel** (`/admin/personnel`) — the org chart itself: every CP/DCP/
  ACP/Inspector, with a live constable headcount per Inspector, plus **Add
  personnel** to create a new ACP or Inspector. CP and DCP rows are marked
  **Fixed** — they can't be deleted (there's always exactly one of each).
  Deleting an Inspector who still has constables is blocked until you
  reassign or delete those constables first.
- **Employee detail** (`/admin/employees/:id`) — live location on a map (polls
  every 5s), a text field to record the location you've assigned them (over
  radio/phone — this just logs it), shift assignment, their last check-in
  photo + GPS, an emergency "force end shift" override that bypasses the
  handover lock, and two distinct destructive actions:
  - **Clear history** — deletes their last check-in (photo included) and
    location, keeps their account and login working.
  - **Delete employee** (Danger zone, type their name to confirm) —
    permanently removes their account, login, session, and photo. This does
    not come back on a redeploy or restart.
- **Live Map** (`/admin/map`) — every on-duty constable's last known location
  plotted at once, across the whole force.

**ACP** — the same **Employees**, **Personnel**, and **Live Map** views as
CP/DCP, but every create/edit/delete control is hidden and the API rejects
those calls even if attempted directly. A banner on each page makes the
read-only status explicit.

**Inspector** — the **Employees** and **Live Map** views are scoped to just
their own constables; the **Personnel** link is hidden entirely (Inspectors
don't see the org chart, only their own slice of it). Opening another
Inspector's constable by URL returns a 404, the same response as a
nonexistent ID, so an Inspector can't tell whether a record exists elsewhere.

**Constable / Employee**
- Signing in **starts the shift** — this is the "next person logged in" event
  that relieves the previous shift's officer.
- Sees their assigned location, then takes/uploads a photo to check in — GPS
  is captured automatically at submit time and sent with the photo.
- While on duty, the browser sends a location ping every 15s so command's view
  stays live.
- **Log out is disabled** until the next shift's constable has logged in. The
  three shifts form a fixed cycle: morning → afternoon → night → morning
  (next day), so the post is always covered. If someone genuinely can't reach
  the next officer (lost phone, emergency), their Inspector (or CP/DCP) can
  force-end their shift from the employee detail page.

## Data & privacy notes (read before deploying for real)

This app stores **photographs of identifiable people together with their
real-time location**. Deploying it publicly makes that a live dataset, so:

- **Change every password via environment variables.** The defaults are
  published in this README and in the repo.
- Check-in photos and employee records sit **unencrypted** in Supabase.
  Anyone with the `service_role` key has full read/write access to
  everything — treat it like a root password.
- Sessions are opaque tokens in `localStorage` with a 12-hour expiry. There is
  no refresh, revocation list, rate limiting, or brute-force protection on
  login.
- CORS is wide open (`cors()` with no origin restriction).
- Location and photo capture require the employee's own browser permission
  grant, but nothing tells them how long data is retained or who can see it.

This is fine for a demo or an internal pilot with people who know they're being
tracked. It is **not** ready to hold real officers' data without hardening auth,
restricting CORS, encrypting at rest, and settling a retention policy.

## Project structure

```
api/
  index.js           Vercel serverless entrypoint (exports the Express app)
server/
  app.js             Express routes (auth, admin, duty/check-in/location, photos)
  index.js           Local dev entrypoint — app.listen()
  db.js              Records, sessions, seed-once logic, rank/scoping, shift-relay helpers
  supabaseClient.js  Supabase client; isSupabaseConfigured gates the in-memory fallback
supabase/
  schema.sql         Run once in the Supabase SQL Editor, on a project never seeded before
  migrate_ranks.sql  Run once instead, against a database with existing pre-rank-system data
src/
  App.tsx            Routes: /login, /admin/*, /employee
  auth/              AuthContext (ranks, permission helpers), LoginPage, RequireRole route guard
  admin/             AdminLayout, AdminOverview, AdminPersonnel, AdminEmployeeDetail, AdminLiveMap
  employee/          EmployeeDashboard (camera check-in + gated logout)
vercel.json          SPA rewrites + /api routing
.env.example         Every supported environment variable
```
