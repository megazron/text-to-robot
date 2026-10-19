#!/usr/bin/env bash
# Build the self-contained website bundle that the texttorobot.org launcher downloads.
# Output: one plain-JavaScript server (no TypeScript, no node_modules) plus the web UI
# and the Python helpers the CAD/training exports embed.
#   usage: deploy/build-site.sh [out-dir]   (run after `npm ci`)
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-site-dist}"
rm -rf "$OUT"
mkdir -p "$OUT/apps/api/src" "$OUT/apps/web" "$OUT/python"

# Keep the repo's relative layout so import.meta.url lookups in the bundle still resolve:
#   apps/api/src -> ../../web/public   and   packages/*/src -> ../../../python
npx --yes esbuild@0.25.10 apps/api/src/server.ts \
  --bundle --platform=node --format=esm --target=node18 \
  --banner:js="import{createRequire as __ttrCreateRequire}from'node:module';const require=__ttrCreateRequire(import.meta.url);" \
  --outfile="$OUT/apps/api/src/server.mjs" --log-level=warning

cp -r apps/web/public "$OUT/apps/web/public"
for pkg in ttr_cad ttr_mujoco; do
  mkdir -p "$OUT/python/$pkg"
  find "python/$pkg" -maxdepth 1 -type f \( -name '*.py' -o -name '*.json' \) -exec cp {} "$OUT/python/$pkg/" \;
done
cp LICENSE "$OUT/LICENSE"

SHA="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
printf '%s\n' "$SHA" > "$OUT/VERSION"
printf '{"commit":"%s","built":"%s"}\n' "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$OUT/apps/web/public/version.json"
echo "site bundle: $OUT ($(du -sh "$OUT" | cut -f1), commit ${SHA:0:7})"
