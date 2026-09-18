// XML-safe formatting helpers.
export function num(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // keep 6 decimals for ordinary values, but never let a small non-zero quantity
  // (tiny inertias, thin plates) round to zero -- use 6 significant figures instead
  let s = Math.abs(n) > 0 && Math.abs(n) < 1e-3 ? n.toPrecision(6) : n.toFixed(6);
  if (!/e/i.test(s)) s = s.replace(/\.?0+$/, "");   // trim trailing zeros (not in exponent form)
  if (s === "-0" || s === "") s = "0";
  return s;
}
export const vec = (v: readonly number[]): string => v.map(num).join(" ");
export function xmlEscape(s: string): string {
  return String(s).replace(/[<>&"']/g, (c) => (
    { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string
  ));
}
/** sanitize an identifier used as an XML name/attribute value */
export function xmlName(s: string): string {
  const cleaned = String(s).replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(cleaned) ? cleaned : "_" + cleaned;
}
export const indent = (s: string, n: number): string =>
  s.split("\n").map((l) => (l ? " ".repeat(n) + l : l)).join("\n");
