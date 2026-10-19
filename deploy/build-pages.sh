#!/usr/bin/env bash
# Build the static GitHub Pages site: the web UI plus the whole generator compiled for the
# browser (apps/web/src/browser-api.ts answers the app's /api/* calls in the tab).
#   usage: deploy/build-pages.sh [out-dir]   (run after `npm ci`)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-pages-dist}"
rm -rf "$OUT"
cp -r apps/web/public "$OUT"

# Python helpers the CAD/training exports embed, keyed by their repo path under python/
mkdir -p apps/web/src/.generated
node -e '
const fs = require("node:fs"), out = {};
for (const dir of ["ttr_cad", "ttr_mujoco"])
  for (const f of fs.readdirSync(`python/${dir}`).sort())
    if (/\.(py|json)$/.test(f)) out[`python/${dir}/${f}`] = fs.readFileSync(`python/${dir}/${f}`, "utf8");
fs.writeFileSync("apps/web/src/.generated/python-files.json", JSON.stringify(out));'

npx --yes esbuild@0.25.10 apps/web/src/browser-api.ts \
  --bundle --format=esm --platform=browser --target=es2022 --minify \
  --alias:node:fs=./apps/web/src/fs-shim.ts --external:node:module --external:node:url --external:node:path --external:node:crypto --external:module --external:fs --external:path \
  --outfile="$OUT/browser-api.js" --log-level=warning

# Project pages live under /<repo>/, so make every root-absolute asset path relative and
# load the in-browser API, which starts the app once the engine is ready.
sed -i \
  -e 's#href="/styles.css"#href="./styles.css"#' \
  -e 's#"/vendor/#"./vendor/#g' \
  -e 's#<script type="module" src="/app.js"></script>#<script type="module" src="./browser-api.js"></script>#' \
  "$OUT/index.html"
grep -q 'src="./browser-api.js"' "$OUT/index.html" || { echo "index.html layout changed; update deploy/build-pages.sh" >&2; exit 1; }
if grep -nE '(href|src)="/[^/]' "$OUT/index.html"; then echo "root-absolute path left in index.html" >&2; exit 1; fi

# CSG kernel used by the design engine (printed parts are built in the browser)
cp node_modules/manifold-3d/manifold.wasm "$OUT/manifold.wasm"

touch "$OUT/.nojekyll"
SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
printf '{"commit":"%s","built":"%s"}\n' "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/version.json"
echo "pages site: $OUT ($(du -sh "$OUT" | cut -f1), commit ${SHA:0:7})"
