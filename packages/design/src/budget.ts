// The time a design may take. A prompt is designed within a budget so that nothing hangs: work that can stop early with a
// sound result checks it and gives the best it has so far, said with the result. The 3D harness router lays the cables it
// has not reached as straight runs (the harness every quick pass has); the designers' own loops are bounded and need
// none. Normal prompts finish far inside the budget, so their output does not depend on it.
let until = Infinity, budgetMs = Infinity;
const notes: string[] = [];
/** Start a budget of `ms` from now (Infinity or undefined: none). Clears the notes of the last one. */
export function startBudget(ms?: number) { budgetMs = ms && Number.isFinite(ms) && ms > 0 ? ms : Infinity; until = Date.now() + budgetMs; notes.length = 0; }
/** the budget has run out */
export const overBudget = () => Date.now() > until;
/** the budget as said in a note ("10 min", "45 s") */
export const budgetText = () => (budgetMs >= 60000 ? `${+(budgetMs / 60000).toFixed(1)} min` : budgetMs >= 1000 ? `${+(budgetMs / 1000).toFixed(1)} s` : `${Math.round(budgetMs)} ms`);
/** say what the budget cut short */
export function budgetNote(s: string) { notes.push(s); }
export const budgetNotes = () => [...notes];
