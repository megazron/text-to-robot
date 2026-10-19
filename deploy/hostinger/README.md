# texttorobot.org deployment

The website is uploaded to the host **once**. After that, every push to `main`, every
published release and every manual run of the **Website** workflow updates the live site
on its own, with no downtime.

```
push / release ──► .github/workflows/site.yml ──► builds deploy/build-site.sh
                                                ──► force-pushes the bundle to the `site` branch
                                                ──► POST https://texttorobot.org/__deploy
texttorobot.org (this launcher) ──► downloads site@<commit> ──► starts it ──► switches traffic
```

If the site is asleep or the POST fails, the launcher also checks the `site` branch every
`pollMinutes` (default 10) and on every start.

## One-time setup (Hostinger)

1. hPanel → **Websites → Add website → Node.js Apps** (Business/Cloud plans; on a VPS just run `npm start` under a process manager).
2. Upload `texttorobot-site.zip` (this folder plus a `deploy.json` holding the token).
3. Node version **18 or newer**, entry file `server.js`, start command `npm start`. No build step, no `npm install` dependencies.
4. Attach the domain `texttorobot.org` and enable SSL.

The repository needs the secret `SITE_DEPLOY_TOKEN` (the same value as `deployToken` in
`deploy.json`) and the variable `SITE_URL=https://texttorobot.org`.

## Commands

| What | Command |
| --- | --- |
| Publish now (rebuild and push live) | `gh workflow run site.yml -R megazron/text-to-robot` |
| See which build is live | `curl -H "Authorization: Bearer $TOKEN" https://texttorobot.org/__deploy` |
| Make the site re-check GitHub | `curl -X POST -H "Authorization: Bearer $TOKEN" https://texttorobot.org/__deploy` |
| Build the bundle locally | `npm ci && deploy/build-site.sh site-dist` |

The commit that is live is also public at `https://texttorobot.org/version.json`.

## Files the launcher writes next to itself

`releases/` (live build and the one before it), `data/robots.json` (share links, kept across
updates), `current.json`, `launcher.log`.
