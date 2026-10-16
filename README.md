# CampConnect — local setup

This package contains the React UI, Express API, PostgreSQL migrations, seed data, public assets, and dependency lockfiles. Dependencies, private environment files, database contents, generated builds, and uploaded user files are excluded. The first setup creates a fresh database with demo accounts and events.

## 1. Install Node and start PostgreSQL (macOS)

Install Homebrew first if `brew` is not available: https://brew.sh

Run in Terminal:

```sh
brew install node@24 postgresql@17
export PATH="$(brew --prefix node@24)/bin:$(brew --prefix postgresql@17)/bin:$PATH"
brew services start postgresql@17
createdb campconnect
```

If `createdb` reports the database already exists, keep it and continue. If another PostgreSQL service already uses port 5432, use that service and its credentials instead of starting a second one. Node 24 satisfies the dependency requirements. On later terminal sessions, run the `export PATH` line again (or add it to your shell profile).

On Windows/Linux, install Node 24 and PostgreSQL using their official installers/package manager. Create a database named `campconnect`, then update `DATABASE_URL` in `server/.env` with the PostgreSQL user/password. No Supabase account is needed.

## 2. Install and configure the app

Extract the ZIP, open Terminal in its `campconnect` folder, and run:

```sh
npm ci
npm --prefix server ci
npm run setup:env
npm run db:setup
npm run dev
```

`setup:env` creates `server/.env` from the included example and generates a random authentication secret. It preserves an existing environment file. The default database URL works with a local Homebrew PostgreSQL installation. For a password-protected database, edit `DATABASE_URL` before running `db:setup`, for example:

```text
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/campconnect
```

URL-encode special characters in the database password. Keep the environment file private.

`db:setup` applies migrations and adds missing demo records; it does not reset existing account passwords. `npm run dev` starts both servers in one terminal. Keep that terminal open.

- App: http://localhost:5173
- Admin login: http://localhost:5173/admin/login
- API health: http://localhost:4000/health

Press Ctrl+C to stop both app servers. PostgreSQL continues running. Stop it separately with `brew services stop postgresql@17`; restart it with `brew services start postgresql@17`.

## Demo accounts

| Role | Email | Initial password |
| --- | --- | --- |
| Student | student@pvppcoe.ac.in | student123 |
| CESA club admin | admin.cesa@pvppcoe.ac.in | campus2026 |
| Platform admin | admin@pvppcoe.ac.in | campus2026 |

Other club admin emails use `admin.mesa`, `admin.ecsa`, `admin.itsa`, `admin.aiml`, or `admin.council` followed by `@pvppcoe.ac.in`. Club admins choose a new password on first login. Use that saved password afterward.

## Run servers separately (optional)

After completing setup, use two terminals in the app folder:

```sh
# Terminal 1: API
npm --prefix server run build
npm --prefix server start
```

```sh
# Terminal 2: frontend, with API proxy
npm run dev:ui
```

Use either the combined command or separate commands, not both at the same time. Port 4000 must be free. Vite may choose another port if 5173 is busy; its terminal output shows the actual URL.

## Verification

```sh
npm run typecheck
npm --prefix server run typecheck
npm test
npm run build
npm --prefix server run build
# With the API running and the demo database seeded:
npm run test:e2e
```

The lifecycle test creates disposable accounts/events and cleans them up. It covers authentication, event creation/editing, required questions, registration, guest approval, capacity/waitlists, QR check-in/undo, cancellation/rejoin, CSV export, profiles, follows, chat, uploads/gallery, announcements and sports rosters.

## Troubleshooting

- Database connection refused: start PostgreSQL and check `DATABASE_URL` and port 5432.
- Database authentication failed: set the correct PostgreSQL username/password in `server/.env`.
- Missing environment configuration: run `npm run setup:env`.
- API port already in use: stop the previously running API before starting another copy.
- Blank or failed API requests: keep both servers running and use the Vite app URL.
- After changing backend source while using the combined launcher, restart `npm run dev` so the API recompiles.

## Service boundaries

Free and approval-based registration, guest management and manual QR verification use the real PostgreSQL API. Paid checkout needs a payment provider and is not enabled. Guest updates appear in the app; outgoing email is not configured. Development password recovery displays a reset link; production email recovery needs an email provider. Camera scanning depends on browser permission.

`npm run build` generates frontend assets, but `npm run preview` alone is not a full deployment: production hosting needs an API reverse proxy and PostgreSQL. The commands above provide the complete local development setup.
