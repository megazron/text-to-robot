# Sentence model for Smarter reading

`Xenova/all-MiniLM-L6-v2/` is the 8-bit ONNX export of [sentence-transformers/all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) by [Xenova](https://huggingface.co/Xenova/all-MiniLM-L6-v2), licensed Apache-2.0, at revision `751bff37182d3f1213fa05d7196b954e230abad9`. The website serves it from here (copied by `deploy/build-pages.sh`), so a prompt is never sent to, and the model never fetched from, another site.

| File | SHA-256 |
|---|---|
| `onnx/model_quantized.onnx` | `afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1` |

The model only matches prompts the word table cannot place to the nearest task, object or animal it knows (`apps/web/src/embedder.ts`). Counts and structure ("two 6 DOF arms on a rover") are read by the grammar in `packages/robot-generator/src/request.ts` and never depend on it.
