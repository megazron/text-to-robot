# Notice

## Fan work
The Mark 43, WALL-E, EVA, Baymax and other character examples are unofficial fan work. They are not affiliated with, sponsored or endorsed by Marvel, Disney, Pixar or any other rights holder. All character names and designs belong to their owners. Do not sell them or use them commercially without permission.

## The Mark 43 pack
The armour is made by the forge in `packages/mesh/src/forge/`, an original model written for this project with reference to public photos of the film suit. The website runs it in your browser; `packages/parts/data/mark43_pack.*` is a cache of its output for the reference suit, written by `scripts/forge_suit.ts`. `scripts/forge_mark43.py` and the Python pack scripts are the earlier offline version, kept as the reference the forge is tested against. None of it contains third-party meshes. The design of the character remains the property of its owners.

## Human motion
The human motion clips in `packages/motion/src/clips.ts` are joint angles taken by `scripts/human_clips.py` from the [Universal Animation Library](https://quaternius.com) by Quaternius, released under CC0 1.0 (public domain). The library itself is not in this repository.

## Emoji outlines
`packages/design/src/emoji-outlines.ts` holds the outlines of 950 emoji, traced from [Twemoji](https://github.com/jdecked/twemoji) 17.0.2 (Copyright 2020 Twitter, Inc and other contributors; graphics licensed under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/)) by `scripts/vendor_emoji.ts`. Changes: each emoji is reduced to its filled silhouette, simplified to at most 32 points per piece, and its mean colour; no artwork, SVG or picture of it is kept. A robot shell made from an emoji's outline inflates that outline.

## Name and logo
The Text to Robot name and logo (`docs/brand`) identify this project. You are welcome to use them to refer to it. Please do not use them in a way that suggests your work is made or endorsed by me. See the [brand guide](docs/brand/README.md).

## Third-party code
Text to Robot's own code is under the [MIT licence](LICENSE). The website and the generator also ship these libraries, each under its own licence:

| Library | Licence | Used for |
|---|---|---|
| [three.js](https://github.com/mrdoob/three.js) | MIT | 3D viewer |
| [manifold-3d](https://github.com/elalish/manifold) | Apache-2.0 | Mesh booleans for printed parts |
| [replicad](https://github.com/sgenoud/replicad) | MIT | CAD modelling on OpenCascade |
| [replicad-opencascadejs](https://github.com/sgenoud/replicad) | LGPL-2.1 | OpenCascade compiled to WebAssembly |
| [earcut](https://github.com/mapbox/earcut) | ISC | Polygon triangulation |
| [gifenc](https://github.com/mattdesl/gifenc) | MIT | Downloading a motion as a GIF |
| [Transformers.js](https://github.com/huggingface/transformers.js) | Apache-2.0 | Running the sentence model in the browser (Smarter reading) |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | MIT | The sentence model's runtime (WebAssembly, served by the site) |
| [all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2), 8-bit ONNX export by [Xenova](https://huggingface.co/Xenova/all-MiniLM-L6-v2) | Apache-2.0 | The sentence model, vendored in `apps/web/models/` (see the README there) |

The marching-cubes triangle table in `packages/mesh/src/forge/mctable.ts` is from Paul Bourke's "Polygonising a scalar field" (from Cory Gene Bloyd), taken from three.js (`examples/jsm/objects/MarchingCubes.js`), MIT licence, copyright 2010-2023 three.js authors. The Gaussian filter, gradient and monotone cubic in `packages/mesh/src/forge/num.ts` are written to give the same numbers as SciPy (BSD-3-Clause) and NumPy (BSD-3-Clause); no code is copied from them.

Python dependencies are listed in `python/pyproject.toml` and `requirements-dev.txt`, with their own licences.
