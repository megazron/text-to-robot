## What this changes

<!-- One or two sentences. Link the issue if there is one: Fixes #123 -->

## Why

## How it was checked

- [ ] `npm run typecheck`
- [ ] `npm run lint` (full output read, not just the last line)
- [ ] `npm test`
- [ ] `python3 scripts/check_links.py`, if Markdown changed
- [ ] Python tests, if `python/` changed: `python3 -m unittest discover -s python/tests -v`
- [ ] Examples regenerated with the scripts, not edited by hand, if their output changed
- [ ] `python3 scripts/check_web.py`, if `apps/web` changed

## Notes for the reviewer

<!-- Screenshots for UI changes. Anything you are unsure about. Anything that is not tested. -->
