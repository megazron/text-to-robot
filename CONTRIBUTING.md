# Contributing

Thanks for helping. Bug reports with a prompt we can paste are as useful as code.

## Ways to help

- **Report a bug.** Use the [bug form](https://github.com/megazron/text-to-robot/issues/new?template=bug_report.yml). Include the prompt or the share link.
- **Ask for a robot.** Use the [robot request form](https://github.com/megazron/text-to-robot/issues/new?template=robot_request.yml). Say what it has to do, with numbers.
- **Improve the parts data.** Most estimated values in `packages/parts/data/` would be better from a datasheet. See [Parts data](docs/PARTS_DATA.md).
- **Fix or extend the code.** Small pull requests that do one thing are reviewed fastest.

## Set up

Node.js 22.6 or newer, and Python 3.10 or newer for the simulation layer.

```bash
git clone https://github.com/megazron/text-to-robot
cd text-to-robot
npm ci
npm run typecheck && npm run lint && npm test
```

[Development](DEVELOPMENT.md) has the Python setup, the browser checks and how to regenerate the examples. [Architecture](docs/ARCHITECTURE.md) shows where things live.

## Before you open a pull request

1. Run `npm run typecheck`, `npm run lint` and `npm test`. Read the whole lint output.
2. If you changed `python/`, run `python3 -m unittest discover -s python/tests -v`.
3. If you changed `apps/web`, run `python3 scripts/check_web.py`.
4. If your change alters what the generator produces, regenerate the examples with the scripts in [Development](DEVELOPMENT.md) and commit the result. Never edit a file under `examples/` by hand: CI checks that each one matches its pipeline.
5. If a check fails for a known reason you cannot fix, list it in the matching `examples/*_known_issues.json` with that reason. Do not loosen the check.

## Rules of the road

- **Real parts only.** A part in the catalogue needs dimensions, a price and an electrical record. Every electrical value says where it came from: a datasheet with its URL, or `estimated` with the reason.
- **Say what is not tested.** If a feature is computed but not simulated, or simulated but not built, the output and the docs say so.
- **Keep generation deterministic.** The same prompt gives the same files. No network access at generation time.
- **Nothing leaves the browser unless the user asks.** The website generates in the tab and sends prompts and designs nowhere. Publishing to the gallery is the one exception, and it needs the user's click and their own GitHub account.
- **Character robots are fan work.** Do not add third-party meshes, scans or film assets. See [NOTICE](NOTICE.md).

## Style

- TypeScript runs natively on Node 22 (type stripping), so use erasable syntax only: no enums, no namespaces, no parameter properties. Biome is the linter.
- Commits: a short, plain subject in the imperative ("Add DS3218 to the servo catalogue"), then a body that says why, if it is not obvious.
- Docs: short sentences, plain words, numbers where you have them, no hype.

## Licence

By contributing you agree that your work is released under the [MIT licence](LICENSE), and that you have the right to release it. Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).
