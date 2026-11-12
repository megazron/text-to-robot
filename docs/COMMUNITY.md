# The community blog

People who design a robot in Text to Robot or Robot Studio can post it to a public board. There is no login, no email
and no sign-up. A post holds a title, a description, tags, a picture of the 3D view, the design as a share link and,
if the poster wants, a display name (left blank, the post says Anonymous).

Nothing is posted unless the person presses **Share on the blog**, checks the preview of exactly what will be public
and presses **Post publicly**. Nothing is sent in the background, and the feed is read only when the Community tab is
opened.

The board's server is a Cloudflare Worker with a D1 database, in [`community/`](../community/). Deploying it is
described in [community/DEPLOY.md](../community/DEPLOY.md). Until it is deployed and named in
`apps/web/public/community.json`, the site hides the board completely and keeps the older GitHub gallery button.

## What is stored

| Stored | Not stored |
|---|---|
| Title (80 characters), description (2000, at most 3 links), up to 5 tags | IP addresses |
| Display name (40), or nothing for Anonymous | Email, accounts, social handles, any other personal field |
| The picture (PNG or WebP, at most 300 KB, checked by its first bytes) | Cookies or tracking |
| The design link (`make=` how it was made, or `robot=` the whole design) | The delete token itself (only its SHA-256) |
| Which product it came from, when it was posted | |
| A hash of the poster's connection for that day (see below) | |
| Reports: the reason given and the reporter's hash for that day | |

## Abuse protection without accounts

- **Turnstile.** Posting and reporting each need a Cloudflare Turnstile token, checked on the server against
  Cloudflare's siteverify, for that action and from the site's own hostnames. Most people see nothing.
- **The connection hash.** The Worker hashes the visitor's address (an IPv4 address whole, an IPv6 address by its /64)
  with a random salt made each day. The salt lives only in KV and expires after two days; once it is gone the hash
  cannot be turned back into an address, even by trying every IPv4 address. The address itself is never written
  anywhere.
- **Rate limits.** 5 posts an hour and 20 reports an hour per hash, and 200 posts a day across everyone. Counters live
  in KV with a time to live, so they delete themselves.
- **Filters.** Length limits, at most 3 links, links never in the title or name, a word filter (whole words, look-alike
  digits and spaced-out letters caught; from the CC BY 4.0 list by Shutterstock, see `community/src/words.js`), and
  duplicate detection (the same title, description and design within 7 days is refused).
- **Reports.** A post with 3 reports (the owner can change this) from different visitors is hidden until I look at it.
  Once I restore or approve a post, reports on it wait for me instead of hiding it again.
- **Bans.** Banning a post's poster hides every post with that hash and blocks the hash from posting. Because the
  salt changes every day, a ban lasts until that day's salt expires (at most two days). That is the cost of keeping
  no lasting identifier; for a determined spammer, switch to review mode.

## Moderation

The admin page is served by the Worker at `/admin`. It holds no secret: paste the `ADMIN_TOKEN` (a Worker secret,
see DEPLOY.md), which stays in that browser tab and goes only to the Worker as `Authorization: Bearer`.

- **Moderation mode.** `instant` (the default): posts go live at once and I delete what breaks the policy.
  `review`: posts wait until I approve them.
- **Hide after N reports.** The report threshold.
- On each post: **Approve** (waiting posts), **Restore** (hidden posts), **Hide**, **Delete** (for good, with its
  reports), **Ban poster**.
- The reports table lists every report with its reason.

Every admin action is also an API call, for scripts:

```bash
T="Authorization: Bearer $ADMIN_TOKEN"; W=https://ttr-community.<your-subdomain>.workers.dev
curl -H "$T" "$W/admin/posts?status=pending"                 # live, pending or hidden; all without status
curl -H "$T" -X POST "$W/admin/posts/<id>/approve"           # or hide, restore, ban
curl -H "$T" -X DELETE "$W/admin/posts/<id>"
curl -H "$T" "$W/admin/reports"
curl -H "$T" -X POST -H "Content-Type: application/json" -d '{"moderation":"review","report_threshold":3}' "$W/admin/settings"
```

## Deleting your own post

After posting, the form shows a private delete link once:
`https://megazron.github.io/text-to-robot/#community-delete=<id>.<token>`. The token sits after the `#`, so it is never
sent to GitHub Pages or kept in server logs; the page sends it to the Worker in an `X-Delete-Token` header and takes
it out of the address bar. Only the token's SHA-256 is stored. Opening the link and pressing **Delete it** removes the
post for good.

## API

| Route | |
|---|---|
| `GET /posts?limit=&cursor=&tag=&product=` | The feed, newest first; `next` is the cursor for the next page |
| `GET /posts/:id` | One live post |
| `GET /posts/:id/thumb` | Its picture |
| `POST /posts` | `{title, description, name, tags, product, recipe, thumbnail (base64), turnstile}`; returns `{id, status, delete_token}` |
| `POST /posts/:id/report` | `{reason, turnstile}` |
| `DELETE /posts/:id` | With `X-Delete-Token` (the poster) or the admin token |
| `GET /admin` | The admin page |
| `/admin/posts`, `/admin/posts/:id/:action`, `/admin/reports`, `/admin/settings` | Owner only, as above |

CORS allows only `https://megazron.github.io` (the `ALLOWED_ORIGINS` variable) and `http://localhost` or
`http://127.0.0.1` on any port. Every response carries `Content-Security-Policy: default-src 'none'` and
`Referrer-Policy: no-referrer`; the admin page allows only its own script and style, by hash.

If the Worker is down, the Community tab says the community is offline and the rest of the site works as before.

## Tests

```bash
cd community && npm ci
npm test                   # validation, filters, rate limits, Turnstile (Cloudflare's test keys, mocked), admin auth,
                           # the delete token, CORS, the whole API on Miniflare with a local D1
deploy/build-pages.sh pages-dist && python3 test/e2e.py      # from the repo root for the build; Chromium against wrangler dev
```

The end-to-end test designs a robot, shares it anonymously, finds it in the feed, opens it, reports it, deletes it
from the admin page, posts again and deletes that post with its private link, then stops the server and checks the
site says the community is offline and still designs robots. CI runs both in the `community` job with Cloudflare's
test keys, so it needs no secrets.
