# CampConnect

**A little more campus. A lot more connection.**

CampConnect is a campus event platform for engineering colleges: students discover what's happening, register for events, follow their clubs and earn XP for showing up — while club admins publish events, manage guest lists and check people in with QR codes. Think "Luma for a single campus", built around one college and its department clubs.

![CampConnect home page — Great events. Your people. Right here.](docs/home-hero.jpg)

---

## What's inside

| Area | What you can do |
| --- | --- |
| **Discover** | Browse upcoming/past events, search and filter by club or category, follow club calendars, open shareable public event pages (`/e/:slug`) |
| **Registration** | Free and approval-based sign-ups, custom registration questions (incl. required ones), capacity limits with waitlists, cancellation and re-join |
| **Check-in** | QR tickets per attendee, camera scanning in the browser, manual QR verification, undo for mis-scans, CSV export of the guest list |
| **Clubs & admin** | Club calendars with admins, event creation/editing, publishing, team management, announcements ("blasts"), temp passwords and role management for platform admins |
| **Community** | Chat channels, photo gallery albums, notifications, profiles with follows, leaderboard and XP, sports team rosters |

Audiences and their home routes:

- **Students** — sign up/log in, then `/dashboard`, `/events`, `/discover`, `/clubs`, `/chat`, `/gallery`, `/sports`, `/xp`, `/leaderboard`
- **Club admins** — `/admin/login`, then `/admin/events`, `/manage/:id` (event workspace: guests, check-in, overview), `/admin/team`, `/admin/gallery`, `/admin/notifications`
- **Platform admin** — `/admin` (users, roles, site-wide announcements)
- **Logged out** — landing page `/`, public event pages, `/discover`

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19 + TypeScript, Vite 7, Tailwind CSS 4, Radix UI (shadcn-style components), TanStack Query, Wouter (routing), Sonner toasts |
| Backend | Node + Express 5 (TypeScript), Zod validation, JWT auth (access + refresh), Helmet, rate limiting, Pino logging, Multer uploads |
| Database | PostgreSQL with SQL migrations (`server/migrations/`) and seed data |
| Tooling | Two lockfiles (`package-lock.json`, `server/package-lock.json`), Node's built-in test runner, a full API lifecycle test |

## Project structure

```text
campconnect/
├── src/                    # React app
│   ├── components/         # camp-app (router), landing page, header
│   │   └── ui/             # shadcn/Radix UI primitives
│   ├── pages/              # discover, public event, manage dashboard, admin
│   ├── hooks/              # use-events, use-guests, use-check-in, use-chat, ...
│   └── lib/                # api client, auth, store, types
├── server/                 # Express API
│   ├── migrations/         # 0001_schema.sql … 0004_*.sql
│   └── src/
│       ├── routes/         # auth, events, guests, calendars, admin, content, gallery
│       ├── services/       # business logic (events, auth, guests, calendars)
│       ├── middleware/     # auth (JWT), rbac (calendar/event access), errors
│       └── db/             # pool, migrate, seed
├── public/                 # static assets
├── scripts/                # dev.mjs (runs API+UI), setup-env.mjs
├── tests/                  # unit tests + api-lifecycle.mjs (e2e)
└── docs/                   # README screenshots
```

## Quick start (macOS)

**1. Install Node 24 and PostgreSQL 17** (skip if you already have them):

```sh
brew install node@24 postgresql@17
export PATH="$(brew --prefix node@24)/bin:$(brew --prefix postgresql@17)/bin:$PATH"
brew services start postgresql@17
createdb campconnect          # "already exists" is fine — keep going
```

If another PostgreSQL already uses port 5432, use that service and its credentials instead of starting a second one. On Windows/Linux, install Node 24 and PostgreSQL with the official installers, create a database named `campconnect`, and set `DATABASE_URL` in `server/.env`. No Supabase account is needed.

**2. Install, configure, seed, run:**

```sh
npm ci
npm --prefix server ci
npm run setup:env     # creates server/.env with a random JWT secret (keeps an existing file)
npm run db:setup      # runs migrations + seeds demo data
npm run dev           # starts API (4000) and UI (5173) in one terminal
```

Then open:

- App: http://localhost:5173
- Admin login: http://localhost:5173/admin/login
- API health check: http://localhost:4000/health

Ctrl+C stops both servers (PostgreSQL keeps running; stop it with `brew services stop postgresql@17`).

Using a password-protected database? Edit `server/.env` before `db:setup`:

```text
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/campconnect
```

URL-encode special characters in the password, and keep `server/.env` private — it's git-ignored.

### Run the API and UI separately (optional)

```sh
# Terminal 1 — API
npm --prefix server run build
npm --prefix server start

# Terminal 2 — frontend (proxies /api to :4000)
npm run dev:ui
```

Use either `npm run dev` **or** the separate commands, never both at once. Port 4000 must be free. If 5173 is busy, Vite picks another port — its terminal output shows the real URL.

## Demo accounts

| Role | Email | Initial password |
| --- | --- | --- |
| Student | student@pvppcoe.ac.in | student123 |
| CESA club admin | admin.cesa@pvppcoe.ac.in | campus2026 |
| Platform admin | admin@pvppcoe.ac.in | campus2026 |

Other club admins: swap `cesa` for `mesa`, `ecsa`, `itsa`, `aiml` or `council` (e.g. `admin.mesa@pvppcoe.ac.in`), same password. Club admins choose a new password on first login — use that saved password afterward.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Build the API, then run API + Vite together |
| `npm run dev:ui` | Frontend only (expects the API on :4000) |
| `npm run build` | Production frontend build → `dist/` |
| `npm run typecheck` | Type-check the frontend |
| `npm test` | Unit tests (Node test runner) |
| `npm run test:e2e` | Full API lifecycle test (needs a running API + seeded DB) |
| `npm run setup:env` | Create/refresh `server/.env` |
| `npm run db:setup` | Compile + run migrations + seed missing demo records |
| `npm --prefix server run migrate\|seed\|reset` | Manage the database directly (`reset` drops and reseeds) |
| `npm --prefix server run dev` | API only, with watch mode |

## Tests

```sh
npm run typecheck
npm --prefix server run typecheck
npm test
npm run build
npm --prefix server run build
npm run test:e2e      # with the API running and the database seeded
```

The e2e lifecycle test creates disposable accounts/events and cleans them up afterwards. It covers authentication, event creation/editing, required questions, registration, guest approval, capacity/waitlists, QR check-in/undo, cancellation/rejoin, CSV export, profiles, follows, chat, uploads/gallery, announcements and sports rosters.

## API overview

Base URL `http://localhost:4000`. JSON in/out, JWT bearer auth where required.

| Mount | Responsibility |
| --- | --- |
| `/api/auth` | signup, login, admin login, refresh/logout, session, password reset/change |
| `/api/events` | list/filter, get by id or slug, create/update/delete, manage view, overview |
| `/api/events/:id/*` | registrations, guests, guest status, bulk actions, CSV export, check-ins |
| `/api/calendars` | club calendars, admins, follows |
| `/api/admin` | users, roles, temp passwords, blasts, announcements |
| `/api` (content) | channels + messages, announcements, activity, leaderboard, dashboard, sports teams |
| `/api` (gallery) | albums, photo uploads (`server/uploads/`, git-ignored), file serving |

## Known limits (service boundaries)

- **Payments are not enabled.** Free and approval-based registration runs on the real API; paid checkout needs a payment provider.
- **Outgoing email is not configured.** Guest updates show in the app; password recovery displays a reset link in development (production recovery needs an email provider).
- **Camera QR scanning** depends on the browser granting camera permission; manual verification always works.
- **`npm run preview` is not a deployment.** Production needs an API reverse proxy and PostgreSQL; the quick-start commands above give the complete local setup.

## Troubleshooting

- **Database connection refused** — start PostgreSQL and check `DATABASE_URL` / port 5432.
- **Database authentication failed** — put the correct PostgreSQL username/password in `server/.env`.
- **Missing environment configuration** — run `npm run setup:env`.
- **API port already in use** — stop the old API before starting another copy.
- **Blank page / failed API requests** — keep both servers running and use the Vite app URL, not `dist/`.
- **Backend changes not picked up** — when using the combined launcher, restart `npm run dev` so the API recompiles.


