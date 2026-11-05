# Persistent Mark 43 reference set

These are the reference photographs and research used for the Mark 43 styling. (The scripts that fetched them and
rendered side-by-side reviews belonged to the earlier exoskeleton model and were retired with it in November 2026.)
Photographs are cached in `references/mark43/images/`, with source URLs in
`sources.json` and downloaded-file SHA-256 hashes in `local_manifest.json`.
The photographs are locally available for every subsequent modelling pass;
the cache is ignored by Git rather than redistributed as project artwork.

`review.html` places production references and
actual front, three-quarter, rear, torso and helmet renders on one page. Production
photographs take precedence over the collectible, which is labelled secondary.
The reference photographs have perspective and pose differences; no pixel-error
score or numerical movie-accuracy percentage is inferred from them.

For each geometry revision:

1. Inspect the relevant saved reference photograph before editing.
2. Regenerate the example (`node scripts/build_examples.ts`) and render it (`python scripts/render_stills.py`).
3. Inspect the full-body and close-up renders against the saved photograph.
4. Keep the renders you compared against next to `review-notes.md`.
5. Record observed improvements and remaining discrepancies in `review-notes.md`.
6. Re-run physical diagnostics; appearance does not establish clearance or fit.

The current references do not contain dimensioned orthographic views or a full
rear prop survey. Those aspects cannot be verified to prop-exact tolerances.
