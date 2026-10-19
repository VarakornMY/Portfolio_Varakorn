# Cloudflare deployment

The Vite site and all six `/api/*` handlers deploy together on the existing
`portfolio-varakorn` Cloudflare Worker. Supabase retains Postgres, sign in and avatar
storage. Gemini retains chat. No users or database rows need migrating.

Production Git branch: `cloudflare-migration`. Cloudflare builds this branch on push.
`main` is retained for the previous Vercel deployment. The migration worktree is
`C:/CODE/1.Varakorn/Varakorn_Portfolio-cloudflare`; commit future deployment changes there.
The original `Full-3D` working folder remains available with its local edits.

## Development and deployment

Use Node 22.12 or later. Copy `.env.example` to `.env` with the existing credentials.

```bash
npm ci
npm run check:cloudflare
npm run dev:cloudflare
npm run deploy:cloudflare
```

Wrangler runs the Worker remotely and serves the preview at `http://localhost:8787`. Ordinary `npm run dev`
continues to use Vite on port 5173. Both reuse the same API handlers.

The checked in Hyperdrive binding points to the existing Supabase database. Query
caching is disabled so rate limits, likes and profile changes read current data.
`wrangler dev --remote` uses the actual Hyperdrive service. Writes through
preview forms therefore affect real data. Vite uses `DATABASE_URL` directly instead.

## Configuration

Build environment: `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`. These values are
intentionally public in the browser bundle.

Worker runtime secrets: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, plus `GEMINI_MODEL` and `ADMIN_USER_IDS` if
customized. Update individual values with `npx wrangler secret put NAME`. Existing
runtime secrets survive subsequent deploys. Never expose server secrets through
Vite's `define` configuration or `VITE_` variables.

Hyperdrive stores its own origin credentials from `SUPABASE_DB_DIRECT_URL`, using
Supabase's direct endpoint rather than another transaction pooler. The Worker does
not need a separate database password secret. If the database password changes,
update Hyperdrive's origin credentials too.

For Cloudflare Git builds, use `npm run build` as the build command and
`npx wrangler deploy` as the deploy command. Set the two public Supabase build
variables in the build environment separately from the runtime secrets.

## Domain cutover

Production canonical host: `https://www.varakorn.me`. Before changing DNS, verify:

- `/`, `/index` and `/index.html` redirect to `/home`; all clean page URLs work.
- `/api/wall`, comments and vouches return data; unknown APIs return JSON 404.
- Email sign in, Google OAuth, profile changes and avatar uploads work.
- The terminal gates unsigned visitors and calls Gemini for signed in visitors.
- Owner moderation still uses the existing Supabase UUID.

Keep Supabase Auth's production Site URL at `https://www.varakorn.me`. For Google
OAuth on a workers.dev preview, add that specific hostname's callback URL to
Supabase's redirect allowlist. Production OAuth uses the same hostname as before.
Analytics excludes workers.dev and pages.dev preview traffic.

The `varakorn.me` Cloudflare zone is active. Its assigned nameservers are `amy.ns.cloudflare.com` and
`giancarlo.ns.cloudflare.com`. These are configured at Hostinger. Preserve unrelated
DNS records during future changes. Retain the previous Vercel deployment until domain, TLS, APIs and sign
in have been verified on Cloudflare.

## Runtime behavior

`worker/index.js` adapts Fetch requests to the shared handlers. Runtime bindings and
database clients are isolated per request with AsyncLocalStorage; connections close
through `waitUntil`. Node development and the moderation CLI retain their existing
process environment and pool behavior. Postgres.js uses prepared statements through
Hyperdrive and disables them for Node's Supabase transaction pooler.

References: [Workers static assets](https://developers.cloudflare.com/workers/static-assets/),
[Supabase on Workers](https://developers.cloudflare.com/workers/databases/third-party-integrations/supabase/),
[Postgres.js with Hyperdrive](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-drivers-and-libraries/postgres-js/).
