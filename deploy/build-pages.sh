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

# the engine runs in a Web Worker; the page script stays tiny
npx --no-install esbuild apps/web/src/browser-engine.ts \
  --bundle --format=esm --platform=browser --target=es2022 --minify \
  --alias:node:fs=./apps/web/src/fs-shim.ts --external:node:module --external:node:url --external:node:path --external:node:crypto --external:node:worker_threads --external:node:os --external:module --external:fs --external:path \
  --outfile="$OUT/browser-engine.js" --log-level=warning
# the armour forge's helpers: each a worker with its own manifold-3d, sharing out the solid work of the Mark 43
npx --no-install esbuild packages/mesh/src/forge/poolworker.ts \
  --bundle --format=esm --platform=browser --target=es2022 --minify \
  --external:node:worker_threads --external:node:module --external:node:url --external:node:path --external:module --external:fs --external:path \
  --outfile="$OUT/forge-worker.js" --log-level=warning
# reading options, each loaded by the worker only when the visitor switches it on: a bring-your-own-key model (the
# Anthropic SDK and an OpenAI-compatible call) and the sentence-embedding model's runtime (the weights come from Hugging Face)
npx --no-install esbuild apps/web/src/byok.ts \
  --bundle --format=esm --platform=browser --target=es2022 --minify \
  --outfile="$OUT/byok.js" --log-level=warning
npx --no-install esbuild apps/web/src/embedder.ts \
  --bundle --format=esm --platform=browser --target=es2022 --minify \
  --external:onnxruntime-node --external:sharp --external:node:* \
  --outfile="$OUT/embed.js" --log-level=warning
npx --no-install esbuild apps/web/src/browser-api.ts \
  --bundle --format=esm --platform=browser --target=es2022 --minify \
  --outfile="$OUT/browser-api.js" --log-level=warning

# The engine API for other pages (docs/ENGINE_API.md): a versioned ES module that starts the same worker as this site
mkdir -p "$OUT/engine/v1"
npx --no-install esbuild apps/web/src/engine/client.ts \
  --bundle --format=esm --platform=browser --target=es2022 --minify \
  --outfile="$OUT/engine/v1/engine.js" --log-level=warning
node scripts/engine_types.ts "$OUT/engine/v1/engine.d.ts"
cp docs/ENGINE_API.md "$OUT/engine/v1/README.md"

# Project pages live under /<repo>/, so make every root-absolute asset path relative and
# load the in-browser API, which starts the app once the engine is ready.
sed -i \
  -e 's#href="/styles.css"#href="./styles.css"#' \
  -e 's#"/vendor/#"./vendor/#g' \
  -e 's#<script type="module" src="/app.js"></script>#<script type="module" src="./browser-api.js"></script>#' \
  "$OUT/index.html"
grep -q 'src="./browser-api.js"' "$OUT/index.html" || { echo "index.html layout changed; update deploy/build-pages.sh" >&2; exit 1; }
if grep -nE '(href|src)="/[^/]' "$OUT/index.html"; then echo "root-absolute path left in index.html" >&2; exit 1; fi
# the import map changed above, so its hash in the Content-Security-Policy meta tag is recomputed (scripts/csp.ts)
node scripts/csp.ts --write "$OUT/index.html"

# CSG kernel used by the design engine (printed parts are built in the browser)
cp node_modules/manifold-3d/manifold.wasm "$OUT/manifold.wasm"
# OpenCascade CAD kernel (exact solids, fillets, STEP export)
cp node_modules/replicad-opencascadejs/dist/replicad_single.wasm "$OUT/replicad_single.wasm"

# The reference Mark 43 armour ships ready-made (the forge's own output, packages/parts/data/mark43_pack.*): the default suit opens at once.
# Any other shape is forged in the tab, after the visitor agrees to the time it takes.
cp packages/parts/data/mark43_pack.json packages/parts/data/mark43_pack.bin "$OUT/"

touch "$OUT/.nojekyll"
SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
printf '{"commit":"%s","built":"%s"}\n' "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/version.json"
echo "pages site: $OUT ($(du -sh "$OUT" | cut -f1), commit ${SHA:0:7})"
