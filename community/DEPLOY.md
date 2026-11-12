# Deploying the community board

The board is a Cloudflare Worker with a D1 database and a KV namespace, all on Cloudflare's free plan. Until it is
deployed and named in `apps/web/public/community.json`, the site hides every part of it.

You need a Cloudflare account (free) and Node 22. Run everything from this folder (`community/`).

## 1. Sign in and install

```bash
cd community
npm ci
npx wrangler login            # opens the browser; allow wrangler to use the account
```

## 2. Create the database and the KV namespace

```bash
npx wrangler d1 create ttr-community
npx wrangler kv namespace create RATE
```

Each command prints an id. Paste them into `wrangler.toml`:

- the D1 `database_id` (replace `00000000-0000-0000-0000-000000000000`);
- the KV `id` (replace `00000000000000000000000000000000`).

If wrangler offers to add the bindings to `wrangler.toml` itself, say no: the file already has them with the right
binding names (`DB`, `RATE`); only the ids change.

Then create the tables:

```bash
npx wrangler d1 migrations apply DB --remote
```

## 3. Turnstile (the human check)

In the Cloudflare dashboard: **Turnstile**, **Add widget**.

- Widget name: `ttr-community`.
- Hostnames: `megazron.github.io`. Add any other host Robot Studio is served from.
- Widget mode: **Managed** (most people see nothing; a few get a single click).

It shows a **site key** (public) and a **secret key** (private). Keep the page open for the next two steps.

## 4. Secrets

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # makes an ADMIN_TOKEN; keep it in a password manager
npx wrangler secret put ADMIN_TOKEN          # paste the token from the line above
npx wrangler secret put TURNSTILE_SECRET     # paste Turnstile's secret key
```

Neither secret is ever written in the repository or sent to the browser. The Worker refuses every admin request if
`ADMIN_TOKEN` is missing or shorter than 32 characters, and refuses every post if `TURNSTILE_SECRET` is missing.

## 5. Deploy

```bash
npx wrangler deploy
```

It prints the Worker's address, like `https://ttr-community.<your-subdomain>.workers.dev`. Check it:

```bash
curl https://ttr-community.<your-subdomain>.workers.dev/          # {"service":"text-to-robot community","ok":true}
```

## 6. Turn the board on in the site

Edit `apps/web/public/community.json` in the repository root:

```json
{"api": "https://ttr-community.<your-subdomain>.workers.dev", "turnstileSiteKey": "<Turnstile site key>"}
```

Commit and push to `main`. The Pages build updates the page's content security policy for that address
(`scripts/csp.ts`), so nothing else needs editing. The Community tab and the **Share on the blog** button appear on
the next deploy. Robot Studio loads `community.js` and `community.json` from the Text to Robot site, so it turns on at
the same time.

## 7. Moderate

Open `https://ttr-community.<your-subdomain>.workers.dev/admin` and paste the `ADMIN_TOKEN`. See
[docs/COMMUNITY.md](../docs/COMMUNITY.md) for what each button does.

## Later

- New origin for Robot Studio (or a custom domain): add it to `ALLOWED_ORIGINS` and `TURNSTILE_HOSTNAMES` in
  `wrangler.toml`, to the Turnstile widget's hostnames, then `npx wrangler deploy`.
- Rotate the admin token: run `npx wrangler secret put ADMIN_TOKEN` again. The old one stops working at once.
- Schema changes: add a numbered file in `migrations/`, then `npx wrangler d1 migrations apply DB --remote`.
- Backups: `npx wrangler d1 export ttr-community --remote --output backup.sql`.
- Logs: `npx wrangler tail`.
- Turn it off: empty `api` in `community.json` (the site hides the board) or `npx wrangler delete`.
