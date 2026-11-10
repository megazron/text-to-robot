import { LIMITS } from "./validate.js";

/** The body as JSON, read with a byte cap (a chunked body has no Content-Length to check first). */
export async function readJson(request) {
  if (Number(request.headers.get("Content-Length") ?? 0) > LIMITS.body) return { tooLarge: true };
  if (!request.body) return { body: null };
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LIMITS.body) { await reader.cancel(); return { tooLarge: true }; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  try { return { body: JSON.parse(new TextDecoder().decode(bytes)) }; } catch { return { body: null }; }
}

