# leaseApp

Lease abstraction app: upload a lease PDF, extract the text in the browser, and have Claude pull out the key terms.

**Stack:** Vite, React, TypeScript, and react-router-dom, with Supabase for Postgres, Auth, Storage and Edge Functions.
The browser talks to Supabase directly through supabase-js. Row level security (RLS) on every table protects the data.
Only the `analyze-lease` Edge Function calls the Claude API.

## Project layout

```
src/
  pages/        Route-level screens
  components/   Shared UI (layout, route guards, form bits)
  lib/          Supabase client, auth context, domain helpers
  i18n/         Message catalog + t() helper
  routes.tsx    Route table, the one place to add pages
supabase/
  config.toml   Local Supabase settings
  migrations/   SQL schema + RLS policies
  functions/    Edge Functions
```

## Prerequisites

- Node.js 20.19+ or 22.12+
- A Docker-compatible container engine for the local Supabase stack (see below)

### Container engine (without Docker Desktop)

`npx supabase start` runs Supabase as containers, so it needs a Docker API. Docker Desktop is not required. A common
option is Docker Engine inside WSL2 (Ubuntu 22.04 or 24.04):

```bash
# inside the WSL Ubuntu shell
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # then restart the WSL shell
```

Run `npx supabase start` from the WSL shell, in the repo under `/mnt/c/...`. WSL2 forwards `localhost` ports, so
`npm run dev` and the browser on Windows can reach `http://127.0.0.1:54321`.

## Running locally

```bash
npm install
npx supabase start          # first run pulls images; prints URLs and keys
cp .env.example .env.local  # paste API URL + publishable/anon key from `npx supabase status`
npm run dev                 # http://localhost:5173
```

Useful local URLs:

- Studio: http://127.0.0.1:54323
- Mailpit (catches auth emails, including password resets): http://127.0.0.1:54324

Email confirmation is off locally, so signing up logs you in right away.

## Scripts

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | Vite dev server on port 5173    |
| `npm run build`     | Type-check and production build |
| `npm run typecheck` | Type-check only                 |
