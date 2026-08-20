# Command Dashboard — Admin & Employee Duty Tracking

An admin dashboard and an employee dashboard for tracking field officers: admin
assigns each officer a location, the officer checks in there with a photo (GPS
captured automatically), and admin can see each officer's live location. Shifts
run in a strict relay — an officer can't log out until the next shift's officer
has logged in — so a post is never left unmanned.

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
This creates the `admins`, `employees`, `sessions`, and `meta` tables, plus a
private `checkin-photos` storage bucket. It's safe to re-run.

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
| `ADMIN_PASSWORD`, `ADMIN2_PASSWORD`, `ADMIN3_PASSWORD` | real passwords, not the defaults |

That's it — 5 variables total. Employees are **not** configured here; see
"Login details" below for how those get created.

See `.env.example` for the full list. Skipping the password vars leaves the
app on the values published in this README — anyone who reads this file can
log in.

### 6. Redeploy

The first request after deploy seeds the 3 admin accounts into Supabase
(visible in **Table Editor** → `admins`). From then on, seeding never runs
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

Seeds **3 fixed admin accounts** and **zero employees**.

| Role | Username | Password |
| --- | --- | --- |
| Admin | `admin` | `Admin#2026` |
| Admin | `admin2` | `Admin2#2026` |
| Admin | `admin3` | `Admin3#2026` |

**Change every one of these before any real deployment** via `ADMIN_PASSWORD` /
`ADMIN2_PASSWORD` / `ADMIN3_PASSWORD` — the values above are published here
and in the repo, so anyone who reads this file can log in on the defaults.

Employees don't have a seed list or env vars at all — as many as you need,
created from the dashboard:

1. Sign in as any admin → **Employees** → **Add employee**.
2. Enter their name, and choose a username + password (6+ characters) right
   there — that's the actual login you're handing them, not a placeholder.
3. Tell the employee those credentials directly. There's no invite email and
   no self-signup.
4. Assign them a shift (morning/afternoon/night) from their detail page
   whenever you want them in the relay — new employees start unassigned.

## How it works

**Admin**
- **Employees** (`/admin`) — every employee, on-duty status, shift, and
  assigned location, plus **Add employee** to create a new account (name,
  username, password — no fixed count, no env var per person).
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
- **Live Map** (`/admin/map`) — every on-duty employee's last known location
  plotted at once.

**Employee**
- Signing in **starts the shift** — this is the "next person logged in" event
  that relieves the previous shift's officer.
- Sees their assigned location, then takes/uploads a photo to check in — GPS
  is captured automatically at submit time and sent with the photo.
- While on duty, the browser sends a location ping every 15s so admin's view
  stays live.
- **Log out is disabled** until the next shift's officer has logged in. The
  three shifts form a fixed cycle: morning → afternoon → night → morning
  (next day), so the post is always covered. If someone genuinely can't
  reach the next officer (lost phone, emergency), admin can force-end their
  shift from the employee detail page.

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
  db.js              Records, sessions, seed-once logic, shift-relay helpers
  supabaseClient.js  Supabase client; isSupabaseConfigured gates the in-memory fallback
supabase/
  schema.sql         Run once in the Supabase SQL Editor — tables + storage bucket
src/
  App.tsx            Routes: /login, /admin/*, /employee
  auth/              AuthContext, LoginPage, RequireRole route guard
  admin/             AdminLayout, AdminOverview, AdminEmployeeDetail, AdminLiveMap
  employee/          EmployeeDashboard (camera check-in + gated logout)
vercel.json          SPA rewrites + /api routing
.env.example         Every supported environment variable
```
