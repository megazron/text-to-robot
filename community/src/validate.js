// Everything a post may contain, checked before it is stored. Pure functions: the unit tests run them in Node.
import { BLOCKED } from "./words.js";

export const LIMITS = {
  title: 80,
  description: 2000,
  name: 40,
  tags: 5,
  tag: 24,
  links: 3,
  thumbBytes: 300 * 1024,
  recipe: 200 * 1024,
  body: 600 * 1024,
};
export const PRODUCTS = ["text-to-robot", "robot-studio"];

// ---------------------------------------------------------------- the blocked words
const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i", "|": "i" };
/** Lower case, accents dropped, look-alike digits read as letters, everything else a single space. */
export function normalise(text) {
  const s = String(text).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[0134578@$!|]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z0-9]+/g, " ").trim();
  // "f u c k" and "f.u.c.k" are one word
  return s.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ""));
}
const BLOCKED_RE = new RegExp(`(?:^| )(?:${BLOCKED.map((w) => normalise(w).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).filter(Boolean).join("|")})(?= |$)`);
// a few that are blocked inside any word too ("fuckface", "f-ingshit"): none of them is part of an ordinary word
const INSIDE = ["fuck", "nigger", "nigga", "faggot", "blowjob", "cocksuck"];
/** The first blocked word in the text, or null. Whole words, so "assembly" and "scunthorpe" pass. */
export function blockedWord(text) {
  const n = normalise(text);
  const m = BLOCKED_RE.exec(n);
  if (m) return m[0].trim();
  const squashed = n.replace(/ /g, "");
  return INSIDE.find((w) => squashed.includes(w)) ?? null;
}

// ---------------------------------------------------------------- links (markdown-lite)
const LINK_RE = /\[([^\]\n]{1,100})\]\((https?:\/\/[^\s)]{1,300})\)|(https?:\/\/[^\s<>"')\]]{1,300})/g;
/** Splits a description into text and link pieces. Rendering escapes the text and gives links rel="nofollow ugc". */
export function tokenize(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(LINK_RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[1] ?? m[3], href: m[2] ?? m[3] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
export const countLinks = (text) => tokenize(text).filter((t) => t.href).length;

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
/** The description as HTML: every character escaped, links kept, line breaks kept. */
export function renderDescription(text) {
  return tokenize(text).map((t) => t.href
    ? `<a href="${escapeHtml(t.href)}" rel="nofollow ugc noopener" target="_blank">${escapeHtml(t.text)}</a>`
    : escapeHtml(t.text)).join("").replace(/\n/g, "<br>");
}

// ---------------------------------------------------------------- images
/** "png", "webp" or null, from the file's first bytes (never from what the client says it is). */
export function imageType(bytes) {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "png";
  if (b.length >= 16 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}
export function decodeBase64(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(s) || s.length % 4) return null;
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------------------------------------------------------------- the design recipe
function fromB64url(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)));
}
/**
 * The design as the hash of a share link: "make=<base64url JSON>" (how it was made: prompt, Arduino tier and changes,
 * which the engine rebuilds) or "robot=<deflate-raw base64url>" (the whole design, as the share links carry it).
 * Returns an error message or null.
 */
export function recipeError(recipe) {
  if (typeof recipe !== "string" || !recipe) return "the design is missing";
  if (recipe.length > LIMITS.recipe) return "the design is too large to post";
  const m = /^(make|robot)=([A-Za-z0-9_-]+)$/.exec(recipe);
  if (!m) return "the design is not a share link";
  if (m[1] === "robot") return null;
  let r;
  try { r = JSON.parse(fromB64url(m[2])); } catch { return "the design recipe is damaged"; }
  if (!r || typeof r !== "object" || Array.isArray(r)) return "the design recipe is damaged";
  if (typeof r.p !== "string" || !r.p.trim() || r.p.length > 2000) return "the design recipe has no prompt";
  if (r.a !== undefined && r.a !== 0 && r.a !== 1) return "the design recipe is damaged";
  if (r.t !== undefined && !(Number.isInteger(r.t) && r.t >= 0 && r.t < 50)) return "the design recipe is damaged";
  if (r.m !== undefined && !(Array.isArray(r.m) && r.m.length <= 100 && r.m.every((x) => typeof x === "string" && x.length <= 1000))) return "the design recipe is damaged";
  for (const k of Object.keys(r)) if (!["p", "a", "t", "m"].includes(k)) return "the design recipe is damaged";
  return null;
}

// ---------------------------------------------------------------- the post
const clean = (s) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "").replace(/\r\n?/g, "\n");
const oneLine = (s) => clean(s).replace(/\s+/g, " ").trim();
export const normaliseTag = (t) => oneLine(t).toLowerCase().replace(/^#/, "").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

/**
 * Checks a post as the client sent it. Returns { post } with the cleaned fields, or { error } with one reason a person
 * can act on. The thumbnail is checked here too: PNG or WebP by its magic bytes, at most 300 KB.
 */
export function validatePost(input) {
  if (!input || typeof input !== "object") return { error: "the post is empty" };
  const title = oneLine(input.title);
  const description = clean(input.description).trim().replace(/\n{3,}/g, "\n\n");
  const name = oneLine(input.name);
  const product = input.product;
  if (!title) return { error: "a title is needed" };
  if (title.length > LIMITS.title) return { error: `the title is longer than ${LIMITS.title} characters` };
  if (description.length > LIMITS.description) return { error: `the description is longer than ${LIMITS.description} characters` };
  if (name.length > LIMITS.name) return { error: `the name is longer than ${LIMITS.name} characters` };
  if (/https?:|www\./i.test(title) || /https?:|www\./i.test(name)) return { error: "links go in the description" };
  if (countLinks(description) > LIMITS.links) return { error: `at most ${LIMITS.links} links in the description` };
  if (!PRODUCTS.includes(product)) return { error: "the product is not known" };
  const rawTags = Array.isArray(input.tags) ? input.tags : typeof input.tags === "string" ? input.tags.split(/[,\s]+/) : [];
  const tags = [...new Set(rawTags.map(normaliseTag).filter(Boolean))];
  if (tags.length > LIMITS.tags) return { error: `at most ${LIMITS.tags} tags` };
  if (tags.some((t) => t.length > LIMITS.tag)) return { error: `a tag is longer than ${LIMITS.tag} characters` };
  const re = recipeError(input.recipe);
  if (re) return { error: re };
  const bad = blockedWord([title, description, name, tags.join(" ")].join(" \n "));
  if (bad) return { error: "the post contains a word that is not allowed here" };
  const thumb = decodeBase64(input.thumbnail);
  if (!thumb || !thumb.length) return { error: "the picture is missing" };
  if (thumb.length > LIMITS.thumbBytes) return { error: "the picture is larger than 300 KB" };
  const thumbType = imageType(thumb);
  if (!thumbType) return { error: "the picture must be a PNG or WebP image" };
  return { post: { title, description, name, product, tags, recipe: input.recipe, thumb, thumbType } };
}

/** The text that makes two posts the same post (duplicate detection): what a reader sees, minus case and spacing. */
export const contentKey = (p) => [normalise(p.title), normalise(p.description), p.recipe].join("\n");
