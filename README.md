# leaseApp

Lease abstraction app: upload a lease PDF, extract the text in the browser, and have Claude pull out the key terms.

**Stack:** Vite, React, TypeScript, and react-router-dom, with Supabase for Postgres, Auth, Storage and Edge Functions.
The browser talks to Supabase directly through supabase-js. Row level security (RLS) on every table protects the data.
Only the `analyze-lease` Edge Function calls the Claude API.

## How a lease is processed

1. **Upload:** the browser creates a `leases` row and uploads the PDF to the private `leases` bucket at
   `<user_id>/<lease_id>.pdf`.
2. **Extract:** pdf.js reads each page's text in the browser and saves it to `lease_pages`.
3. **Analyze:** the browser calls the `analyze-lease` Edge Function. It runs as the signed-in user, so RLS still
   applies. It sends the page text to Claude (`claude-opus-5-5`, structured JSON output) and saves the key terms on
   the lease, along with the page each value came from (`source_pages`).

Status moves `uploading → extracting → extracted → analyzing → completed`, or `failed` with an `error_message`. A
lease that stays in progress for more than 5 minutes (for example because the tab was closed) shows as **Stalled**
and can be retried. Retry picks up from the step that didn't finish.

Scanned PDFs with no selectable text are rejected; OCR is not supported yet.

**Amendments** are uploaded from a lease's overview page and go through the same steps, stored in
`lease_amendments` and `amendment_pages`. Claude is given the lease's current terms and records only what the
amendment changes, each with its page and quote. The app works out the **current terms** by applying completed
amendments to the original terms in effective-date order (`applyAmendments` in `src/lib/amendments.ts`). The list,
Dashboard and Reports all use the current terms. Edit always changes the original lease terms.

## Project layout

```
src/
  pages/        Route-level screens (Lease Abstract, Dashboard, Reports, auth pages)
  components/   Shared UI (header, user menu, lease table, upload dropzone, dialogs)
  lib/          Supabase client, auth context, lease data access, pdf.js extraction, formatting
  i18n/         Message catalog + t() helper
  routes.tsx    Route table; add new pages here and in AppLayout's NAV_ITEMS
supabase/
  config.toml   Local Supabase settings
  migrations/   SQL schema, RLS policies and the storage bucket
  functions/
    _shared/          Helpers shared between functions (CORS)
    analyze-lease/    Claude extraction (index.ts = HTTP handler, extract.ts = prompt + schema)
```

## Prerequisites

- Node.js 20.19+ or 22.12+
- A Docker-compatible container engine for the local Supabase stack (see below)
- A Claude API key from https://platform.claude.com

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
cp supabase/functions/analyze-lease/config.example.ts supabase/functions/analyze-lease/config.ts
#   ...then paste your Claude API key into config.ts (gitignored)
npx supabase start          # first run pulls images; applies migrations; serves Edge Functions
cp .env.example .env.local  # paste API URL + publishable/anon key from `npx supabase status`
npm run dev                 # http://localhost:5173
```

`npx supabase start` serves the functions that exist when it starts, and reads `config.ts` at that point too. After
adding a function or changing `config.ts`, restart the stack with `npx supabase stop` and then
`npx supabase start`. Your data is kept.

After pulling new migrations, apply them with `npx supabase migration up`. `npx supabase db reset` also works, but
it wipes the local database.

Useful local URLs:

- Studio: http://127.0.0.1:54323 (tables, users, storage, SQL editor)
- Mailpit (catches auth emails, including password resets): http://127.0.0.1:54324

Email confirmation is off locally, so signing up logs you in right away.

## Hosted Supabase project

- **Claude key:** `config.ts` is gitignored, so it is never deployed from git. Set the key as a secret instead with
  `npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...`, or in the dashboard under Edge Functions → Secrets. The
  function uses the secret when it is set and only falls back to `config.ts` otherwise.
- **Migrations:** with the GitHub integration's production deploy on, pushing a migration to the production branch
  applies it to the hosted database. Test migrations locally first.
- **Auth URLs:** set the Site URL and redirect URLs (including `<your-frontend>/reset-password`) under
  Authentication → URL Configuration.

## Adding a language

All UI text lives in [src/i18n/en.ts](src/i18n/en.ts) and is read through `t('section.key')`.

1. Copy `en.ts` to e.g. `es.ts`. Change the export to `export const es: Messages = { ... }` (import `Messages` from
   `./en`) and translate the strings. Keep the `{placeholders}` as they are. The build fails if a key is missing.
2. Register it in `LOCALES` in [src/i18n/index.ts](src/i18n/index.ts):
   `{ code: 'es', label: 'Español', intl: 'es', messages: es }`.

A language picker then appears in the header and on the login pages. The choice is remembered per browser. Text
Claude extracts from a lease (names, summary, renewal terms) stays in the language of the lease.

## Scripts

| Command             | What it does                    |
| ------------------- | ------------------------------- |
| `npm run dev`       | Vite dev server on port 5173    |
| `npm run build`     | Type-check and production build |
| `npm run typecheck` | Type-check only                 |
