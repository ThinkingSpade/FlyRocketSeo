# Deploying FlyRocketSEO internet-facing (with login)

This guide is for the common case: you want FlyRocketSEO reachable over the internet,
**behind a login**, for yourself and optionally a few teammates or clients.

The short version of the recommended setup:

- **Host:** Cloudflare Workers (the Docker image is single-user/local-only by
  design — don't expose it to the internet).
- **Login:** `AUTH_MODE=cloudflare_access` — Cloudflare Access (Zero Trust) puts
  an SSO login in front of the app. Free for up to 50 users, no password/email
  infrastructure to run.
- **Database:** **D1** to start (free, zero extra setup). Move to **Supabase /
  Postgres** later only if you want managed backups, a SQL dashboard, or scale
  beyond D1.

> **Access model — read this first.** Cloudflare Access gives everyone your
> policy allows a **single shared workspace**: all allowed users see the same
> projects and data. That's ideal for you + teammates/clients working together.
> It is **not** per-user isolation. If every user needs their own private,
> separate account (a true multi-tenant SaaS), that requires `AUTH_MODE=hosted`
> (Better Auth email/password + an email provider + billing) — a substantially
> larger setup that is out of scope here.

For the granular Cloudflare Access dashboard steps, this guide references the
existing [`SELF_HOSTING_CLOUDFLARE.md`](./SELF_HOSTING_CLOUDFLARE.md) rather than
duplicating them (so the two never drift). This document is the opinionated
"internet-facing + login" path on top of it.

---

## Prerequisites

- A Cloudflare account (the free plan is fine).
- A DataForSEO API key (`DATAFORSEO_API_KEY`) — see the main [README](../README.md).

---

## Step 1 — Deploy to Cloudflare

Two ways; pick one.

**A) Deploy button (simplest).** Use the "Deploy to Cloudflare" button in the
[README](../README.md#cloudflare-self-hosting). Cloudflare provisions fresh KV,
D1, and R2 resources for your account and rewrites their ids automatically — you
do **not** edit `wrangler.jsonc` by hand. Follow
[`SELF_HOSTING_CLOUDFLARE.md` → Initial setup](./SELF_HOSTING_CLOUDFLARE.md#initial-setup).

**B) Manual CLI deploy.** If you prefer `wrangler`, follow
[`SELF_HOSTING_CLOUDFLARE.md` → Manual deploy with Wrangler](./SELF_HOSTING_CLOUDFLARE.md#manual-deploy-with-wrangler).
With this path you own `wrangler.jsonc`, so:

- **Create your own D1** and set its id:
  ```bash
  npx wrangler d1 create flyrocketseo
  ```
  Put the returned `database_id` in the `d1_databases` block of `wrangler.jsonc`.
- **Delete the `hyperdrive` block** in `wrangler.jsonc` unless you're using
  Postgres (Step 3, Option B). Its id belongs to the FlyRocketSEO project's account
  and `wrangler deploy` will fail on it otherwise. The block is already marked
  with a "SELF-HOSTERS ... DELETE this hyperdrive block" comment.
- **Run migrations against your D1:**
  ```bash
  npm run db:migrate:prod
  ```

---

## Step 2 — Turn on the login (Cloudflare Access)

1. In the Cloudflare dashboard, enable **Cloudflare Access** on your Worker's
   route and create an Access **application + policy**, allowing the email
   addresses (or an email domain) you want to let in. Steps:
   [`SELF_HOSTING_CLOUDFLARE.md` → Configure authentication and secrets](./SELF_HOSTING_CLOUDFLARE.md#initial-setup).
2. Set these secrets on the Worker (`Settings → Variables & Secrets`):

   | Secret               | Value                                    | Notes                                   |
   | -------------------- | ---------------------------------------- | --------------------------------------- |
   | `TEAM_DOMAIN`        | `https://your-team.cloudflareaccess.com` | The domain from your Access `JWKS_URL`. |
   | `POLICY_AUD`         | your Access application AUD tag          | Shown during Access setup.              |
   | `DATAFORSEO_API_KEY` | your DataForSEO key                      | Required for the app to fetch data.     |

   `AUTH_MODE` defaults to `cloudflare_access` when unset, so you don't have to
   set it — but you can set `AUTH_MODE=cloudflare_access` explicitly if you like.

3. Open your Worker URL, sign in through Cloudflare Access, and FlyRocketSEO should
   load. If login fails, re-check the two Access values and the Access toggle.

---

## Step 3 — Choose your database

### Option A — D1 (recommended to start)

Nothing extra. D1 is the default (`DATABASE_PROVIDER` unset), it's free, and it
requires no external service. If you used the Deploy button, your D1 is already
provisioned and migrated. This is the fastest way to get live.

Back up your data anytime from **Settings → Data → Download a backup** (the
in-app JSON export), or with `npx wrangler d1 export`.

### Option B — Supabase / Postgres (managed, for scale)

Use this if you want managed automated backups, a SQL dashboard, or headroom
beyond D1. Login still runs through Cloudflare Access — Supabase is **only** the
database here (the app uses Better Auth, not Supabase Auth).

1. Create a Supabase project and copy its **direct / session-mode** connection
   string.

   > ⚠️ Use the direct connection (session mode), **not** the transaction pooler
   > on port `6543`. The app's Postgres driver uses prepared statements, which
   > PgBouncer's transaction mode breaks. Cloudflare Hyperdrive does its own
   > pooling and expects a session-mode connection anyway.

2. Create a **Hyperdrive** config pointing at that connection string
   (`npx wrangler hyperdrive create ...`) and set its id in the `hyperdrive`
   block of `wrangler.jsonc` (replace the FlyRocketSEO-owned id that ships in the
   repo). Hyperdrive is the **only** way the app reaches Postgres — there is no
   direct-connection fallback.
3. Set `DATABASE_PROVIDER=postgres` as a Worker **secret** (a secret, not a plain
   var, so it survives `wrangler deploy`, which resets vars).
4. Run the Postgres migrations against Supabase:
   ```bash
   npm run db:migrate:pg
   ```

The schema is identical to D1 (kept in lockstep by `schema-parity.test.ts`), so
no application code changes are needed to switch.

---

## Step 4 — Add or remove teammates

Everyone is managed by your **Cloudflare Access policy** — no user management
inside FlyRocketSEO. Add or remove emails there; all allowed users share one
workspace. See
[`SELF_HOSTING_CLOUDFLARE.md` → Give teammates access](./SELF_HOSTING_CLOUDFLARE.md#give-teammates-access-to-flyrocketseo).

---

## Optional add-ons

These are all off by default and safe to skip.

### Google Search Console (recommended)

Free, first-party search data (real clicks/impressions/CTR/position +
striking-distance opportunities), linked **per project** — so each client's
project connects its own Search Console property. It uses Google's API, not
DataForSEO, so it costs nothing to run. One-time setup:

1. Create a Google OAuth client in **Google Cloud → APIs & Services →
   Credentials**.
2. Add this exact **Authorized redirect URI** (scheme + host must match your
   deployment, no trailing slash):

   ```
   https://<your-worker-domain>/api/gsc/oauth/callback
   ```

   e.g. `https://flyrocketseo.<you>.workers.dev/api/gsc/oauth/callback` or your
   custom domain. A mismatch here is the #1 cause of Google's
   `redirect_uri_mismatch`.

3. Always set this Worker **secret** (it encrypts the stored OAuth tokens and
   credentials, and can't live anywhere but env):

   | Secret               | Value                      |
   | -------------------- | -------------------------- |
   | `BETTER_AUTH_SECRET` | a random string ≥ 32 chars |

4. Provide the Google client ID/secret **either way** — pick one:
   - **Env route:** set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Worker
     secrets too. Available immediately on deploy.
   - **In-app route:** leave them unset and, after deploying, go to
     **Settings → Google Search Console** and paste the client ID/secret there.
     They're encrypted at rest (with `BETTER_AUTH_SECRET`) and can be changed or
     removed later without a redeploy. Env, when set, is the default; an in-app
     override takes precedence.

5. If your OAuth consent screen is in **Testing** mode, add each user's Google
   account under **OAuth consent screen → Test users** (or publish the screen).

Then connect it inside the app: open a project → **GSC Insights / Search
Performance** → connect, and pick that client's verified property. Full
walkthrough:
[`SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md`](./SELF_HOSTING_GOOGLE_SEARCH_CONSOLE.md).

### Other add-ons

- **SAM (in-app AI agent) + AI features** — set `OPENROUTER_API_KEY`
  ([get a key](https://openrouter.ai/settings/keys)).
- **R2 cache cleanup** — add a lifecycle rule so cached DataForSEO responses
  expire (see
  [`SELF_HOSTING_CLOUDFLARE.md` → add an R2 lifecycle rule](./SELF_HOSTING_CLOUDFLARE.md#initial-setup)).

---

## Secrets reference

| Secret                                     | When needed                                    |
| ------------------------------------------ | ---------------------------------------------- |
| `DATAFORSEO_API_KEY`                       | Always.                                        |
| `TEAM_DOMAIN`, `POLICY_AUD`                | Always (Cloudflare Access login).              |
| `DATABASE_PROVIDER=postgres`               | Only for the Supabase/Postgres path (Step 3B). |
| `BETTER_AUTH_SECRET`                       | Only if you enable Google Search Console.      |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Only for Google Search Console.                |
| `OPENROUTER_API_KEY`                       | Only for SAM / AI features.                    |

---

## Why not Docker for this?

The Docker image runs in `local_noauth` mode (single user, no login) and is
intended for local use. Exposing it to the internet would require standing up a
reverse proxy plus an auth layer yourself. Cloudflare Workers + Cloudflare Access
gives you the login, TLS, and a global edge for free — which is why it's the
recommended internet-facing path.
