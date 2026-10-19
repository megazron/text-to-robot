// node:fs stand-in for the browser bundle. The CAD and training exports read a few Python
// helper files that ship with the repo; deploy/build-pages.sh embeds them in python-files.json.
import files from "./.generated/python-files.json";

const embedded = files as Record<string, string>;
const key = (p: string | URL) => {
  const s = typeof p === "string" ? p : p.pathname;
  const i = s.lastIndexOf("/python/");
  return i < 0 ? s : s.slice(i + 1);
};

export function readFileSync(p: string | URL): string {
  const text = embedded[key(p)];
  if (text === undefined) throw new Error(`${key(p)} is not bundled into the browser build`);
  return text;
}

export function readdirSync(p: string | URL): string[] {
  const dir = key(p).replace(/\/?$/, "/");
  return Object.keys(embedded).filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes("/")).map((k) => k.slice(dir.length));
}
