# Command Dashboard — Admin & Employee Duty Tracking

An admin dashboard and an employee dashboard for tracking field officers: admin
assigns each officer a location, the officer checks in there with a photo (GPS
captured automatically), and admin can see each officer's live location. Shifts
run in a strict relay — an officer can't log out until the next shift's officer
has logged in — so a post is never left unmanned.

## Stack

- **Frontend:** React 19 · TypeScript · Vite · Tailwind CSS 4 · react-router-dom · Leaflet / react-leaflet · lucide-react · sonner
- **Backend:** Express (runs as a Vercel serverless function in production) · Redis via `@upstash/redis` · multer · bcryptjs

## Getting started

Run both the API and the frontend (two terminals):

```bash
npm run server   # API on http://localhost:4001
npm run dev      # frontend on http://localhost:5174 (proxies /api to 4001)
```

Open http://localhost:5174 and sign in.

Locally, no database is needed — with no Redis env vars set, the server keeps
everything in memory and reseeds on restart.

## Deploying to Vercel

The data is intentionally disposable: it lives in Redis, and wiping the store
returns the app to its seeded state.

1. Push this repo to GitHub, then import it in Vercel. The build settings come
   from `vercel.json`, so leave the defaults alone.
2. In the Vercel project: **Storage → Create Database → Redis**, and connect it
   to the project. Vercel injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`
   automatically — the app picks them up with no code change.
3. **Settings → Environment Variables:** set `ADMIN_PASSWORD` and the
   `EMP1_PASSWORD`…`EMP5_PASSWORD` values. See `.env.example`. Skipping this
   leaves the app on the passwords published in this README.
4. Redeploy so the env vars take effect.

To reset everything, flush the Redis store from the Vercel dashboard; the next
request reseeds the five employees and the admin.

### Why Redis and not a file

Vercel runs the API as serverless functions with a **read-only** filesystem, and
consecutive requests may hit different instances. Since the employee is on a
phone and the admin on a laptop, their requests need a store they both reach —
in-process state would leave the admin unable to see check-ins.

### Note on GPS

Deployed over HTTPS on a phone, geolocation uses the device's real GPS and is
accurate to roughly 5–20m. On a desktop it falls back to Wi-Fi positioning,
which is far coarser and on macOS often fails outright unless the browser is
enabled under System Settings → Privacy & Security → Location Services.

## Login details

| Role | Username | Password | Shift |
| --- | --- | --- | --- |
| Admin | `admin` | `Admin#2026` | — |
| Employee | `employee1` | `Emp1#2026` | Morning (06:00–14:00) |
| Employee | `employee2` | `Emp2#2026` | Afternoon (14:00–22:00) |
| Employee | `employee3` | `Emp3#2026` | Night (22:00–06:00) |
| Employee | `employee4` | `Emp4#2026` | Unassigned (reserve) |
| Employee | `employee5` | `Emp5#2026` | Unassigned (reserve) |

Change these before any real deployment — reassign shifts and update passwords
from the admin dashboard / backend as needed.

## How it works

**Admin**
- **Employees** (`/admin`) — every employee, on-duty status, shift, and assigned location.
- **Employee detail** (`/admin/employees/:id`) — live location on a map (polls
  every 5s), a text field to record the location you've assigned them (over
  radio/phone — this just logs it), shift assignment, their last check-in
  photo + GPS, and an emergency "force end shift" override that bypasses the
  handover lock.
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
- Check-in photos and employee records sit **unencrypted** in Redis. Anyone
  with the store's credentials can read them.
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
  db.js              Records, sessions, seed data, shift-relay helpers
  store.js           Redis adapter, falls back to in-memory when unconfigured
src/
  App.tsx            Routes: /login, /admin/*, /employee
  auth/              AuthContext, LoginPage, RequireRole route guard
  admin/             AdminLayout, AdminOverview, AdminEmployeeDetail, AdminLiveMap
  employee/          EmployeeDashboard (camera check-in + gated logout)
vercel.json          SPA rewrites + /api routing
.env.example         Every supported environment variable
```
