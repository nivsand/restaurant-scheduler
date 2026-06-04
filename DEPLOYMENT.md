# Deployment guide — Vercel + cloud Postgres

This app runs on Vercel with a managed Postgres database (Neon, Supabase, Vercel Postgres, or any Postgres compatible service). The app is **Postgres-only** — both local dev and production use Postgres. There is a single `prisma/schema.prisma`; the old dual-schema (`schema.postgres.prisma` + manual `cp`) has been removed.

---

## 1. Prisma schema (single source of truth)

`prisma/schema.prisma` is the only schema and is already Postgres-native:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

The repo ships an initial migration at `prisma/migrations/0_init/migration.sql`. On a fresh database, `prisma migrate deploy` creates every table from it. No schema copying is needed anymore.

## 2. Create a Postgres database

Pick one:

- **Neon** (recommended for the free tier) — https://neon.tech → create project → copy the **pooled** connection string
- **Vercel Postgres** — from your Vercel project: Storage tab → Create Database → "Postgres"
- **Supabase** — https://supabase.com → Project → Database → connection string (use the pooled URL on port 6543)

You'll need TWO connection strings if your provider distinguishes them:

- `DATABASE_URL` — pooled, used by the app at runtime (typically port 6543)
- `DIRECT_URL` — direct, used by `prisma migrate` (typically port 5432)

If your provider gives only one, use it for both.

## 3. Configure Vercel environment variables

In Vercel → your project → Settings → Environment Variables, add:

| Name | Example | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@host/db?sslmode=require&pgbouncer=true` | Pooled string |
| `DIRECT_URL` | `postgresql://user:pass@host:5432/db?sslmode=require` | Optional; for migrations |
| `AUTH_SECRET` | generate with `openssl rand -base64 32` | NextAuth session secret — REQUIRED |
| `AUTH_TRUST_HOST` | `true` | Required behind Vercel's proxy |
| `ADMIN_EMAIL` | `you@example.com` | First-manager email (bootstrap) |
| `ADMIN_PASSWORD` | choose-a-strong-password | First-manager password (≥8 chars) |
| `ADMIN_NAME` | `Admin` | Display name |
| `RESTAURANT_NAME` | `My Restaurant` | Restaurant display name |
| `PUBLIC_URL` | `https://your-app.vercel.app` | Used by the share-form card |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Optional — only needed for LLM fallback in the parser |

Set them for "Production" (and "Preview" if you want preview deploys to work end-to-end).

## 4. Build script (already configured)

The repo's `build` script already runs migrations before building, so a Vercel deploy creates/updates tables automatically:

```json
"scripts": {
  "build": "prisma generate && prisma migrate deploy && next build",
  "postinstall": "prisma generate"
}
```

`prisma migrate deploy` needs `DIRECT_URL` (or `DATABASE_URL`) reachable during the build. Make sure those env vars are set in Vercel before the first deploy.

## 5. Run the first migration

After committing the Postgres schema and pushing:

**Option A — let Vercel run it during build**

If you switched the build script to include `migrate deploy`, the first deploy will create all tables automatically.

**Option B — run it once from your laptop**

```bash
# point at the production DB
export DATABASE_URL="postgresql://..."
export DIRECT_URL="postgresql://..."

# first-time creation (or)
npx prisma db push

# subsequent updates (preferred if you have migration files)
npx prisma migrate deploy
```

## 6. Bootstrap the admin

Once tables exist, create the first manager + restaurant:

```bash
# locally pointing at prod
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD='choose-a-strong-password' \
ADMIN_NAME="Admin" \
RESTAURANT_NAME="My Restaurant" \
DATABASE_URL="postgresql://..." \
npx tsx scripts/bootstrap-admin.ts
```

Or trigger it from Vercel by adding a deploy command. The script is idempotent — running it twice won't create duplicates and will update the manager's password to whatever `ADMIN_PASSWORD` is set to.

If you don't want a "deploy = re-bootstrap" cycle, run it once after the first deploy and then never again. The manager can change their name/email/password from `/settings` in the app afterward.

## 7. Verify

- Visit `https://your-app.vercel.app/login`
- Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- Confirm dashboard loads, restaurant name shows in the sidebar
- Go to `/employees` and add a few staff (the prod DB starts empty)
- Optionally: visit `/settings` and rotate the bootstrap password to a new one

## 8. Local development (Postgres)

The app is Postgres-only. A `docker-compose.yml` ships a local Postgres whose
credentials already match `.env.example`. From a clean clone:

```bash
npm install              # also runs `prisma generate` via postinstall
npm run db:up            # start local Postgres (docker compose up -d db)
npm run db:migrate       # apply migrations (prisma migrate deploy)
npm run db:seed          # sample employees + a manager login
npm run dev
```

To wipe and rebuild the local DB from scratch (drops data, reapplies all
migrations, then auto-runs the seed):

```bash
npm run db:reset         # prisma migrate reset --force
```

No Docker? Any local Postgres works (Postgres.app, Homebrew, a free Neon DB) —
just point `DATABASE_URL`/`DIRECT_URL` in `.env` at it and skip `db:up`.

The old `prisma/dev.db` SQLite file has been removed. Never commit a real DB
file to git.

## 9. Common gotchas

- **`AUTH_SECRET` missing** → login appears to work but the JWT can't be signed; you'll see `[next-auth] No secret` warnings in build logs. Always set this in production.
- **`AUTH_TRUST_HOST=false`** (default in Auth.js when host isn't `localhost`) → login redirects loop. Set it to `true`.
- **`DATABASE_URL` uses port 5432 without `pgbouncer=true`** → Prisma client may exhaust the connection pool under load. Use the pooled URL with `pgbouncer=true` in the query string.
- **Prisma client wasn't regenerated after schema change** → API throws "table doesn't exist". Always `npx prisma generate` after editing `schema.prisma`, and ensure your `build` script runs it before `next build`.
- **First manager can't log in** → check that `bootstrap-admin.ts` actually ran. The deploy logs should show "Admin bootstrap complete."
- **PNG export fails on iOS Safari** → known limitation of html-to-image. Tell users to use the Print → PDF flow instead.

## 10. Optional: scheduled re-seed of common shift templates

The `prisma/seed.ts` script seeds 14 sample employees plus a default shift template. **Do not run this in production** — it would overwrite real data. The seed is intentionally separate from `bootstrap-admin.ts`, which only touches Restaurant + Manager tables.

If you want production-only "good defaults" for the shift template, add them to `bootstrap-admin.ts` behind an `if-empty` check.
