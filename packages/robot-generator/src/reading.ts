// The knowledge-table reading of a prompt that names no robot type: keywords first, then the closest entry by meaning.
import { KNOWLEDGE, TASKS, OBJECTS, ANIMALS, NAMED, lookup, type KnowledgeEntry } from "./knowledge.ts";
import { nearestLexical } from "./similarity.ts";

export interface Reading { entry: KnowledgeEntry; matched: string; path: "keywords" | "similarity"; score?: number; by?: string; }

/**
 * A prompt with no robot type: a task ("waters my plants"), an object ("a toaster") or an animal ("a robot fish") by its
 * keywords; failing that the closest entry by meaning. `hint` names an entry chosen beforehand (by the website's
 * sentence-embedding model, which runs asynchronously).
 */
export function readKnowledge(t: string, hint?: string): Reading | undefined {
  const k = lookup(t, [...TASKS, ...OBJECTS, ...ANIMALS]);
  if (k) return { entry: k.entry, matched: k.matched, path: "keywords" };
  if (hint) { const e = KNOWLEDGE.find((x) => x.id === hint); if (e) return { entry: e, matched: t.trim().slice(0, 80), path: "similarity", score: undefined, by: "sentence-embedding model" }; }
  const s = nearestLexical(t);
  if (s) return { entry: s.entry, matched: t.trim().slice(0, 80), path: "similarity", score: s.score, by: s.by };
  return undefined;
}

/** A named or fictional robot in the prompt is read as its body plan: the name is replaced by the plan in words. */
export function readNamed(t: string): { text: string; note?: string; entry?: KnowledgeEntry } {
  const k = lookup(t, NAMED);
  if (!k) return { text: t };
  return { text: t.replace(k.entry.rx, ` ${k.entry.canonical} `).replace(/\s+/g, " ").trim(), entry: k.entry,
    note: `"${k.matched}" read as its body plan: ${k.entry.why} (an honest buildable interpretation; no meshes, logos or likeness of the original)` };
}
