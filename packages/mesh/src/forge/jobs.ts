// The solid jobs of the forge's pool (pool.ts): what each worker answers, and what runs here when there is no pool.
import { scope, asSolid, asMesh, turn, union, clipUnion, overlaps, bbox, type P3 } from "./geo.ts";
import type { TriMesh } from "./mc.ts";
import type { Job } from "./pool.ts";

type Box = [P3, P3];
export async function answerJob(job: Job): Promise<unknown> {
  const a = job.args as Record<string, any>;
  switch (job.op) {
    case "union": return scope(() => asMesh(clipUnion((a.meshes as TriMesh[]).map(asSolid), a.clip as Box | undefined)));
    case "sweep": return scope(() => { const x = asSolid(a.mesh); return asMesh(clipUnion((a.angles as number[]).map((t) => turn(x, a.o, a.e, t)), a.clip as Box | undefined)); });
    case "trimHits": return scope(() => {
      // a door's shell turned through `angles` against one solid it meets: what overlaps, swung back onto the door, and what its hardware meets
      const light = asSolid(a.light), q = asSolid(a.q), qb = bbox(q), steel = a.steel ? asSolid(a.steel) : undefined, hits: TriMesh[] = [], theirs: TriMesh[] = [];
      for (const t of a.angles as number[]) scope(() => {
        const c = turn(light, a.o, a.e, a.sg * t);
        if (!overlaps(bbox(c), qb)) return;
        const x = c.intersect(q);
        if (x.volume() < 0.2) return;
        hits.push(asMesh(turn(x, a.o, a.e, -a.sg * t)));
        if (steel) { const y = turn(steel, a.o, a.e, a.sg * t).intersect(q); if (y.volume() > 0.05) theirs.push(asMesh(a.unpose ? turn(y, a.unpose[0], a.unpose[1], a.unpose[2]) : y)); }
      });
      return { hits, theirs };
    });
    case "limit": return scope(() => {
      // a limb joint: the child turned in steps until its overlap with the parent grows past `collide` over the rest pose
      const c = asSolid(a.child), q = asSolid(a.parent), base = c.intersect(q).volume(), lim = a.lim as number, step = (a.step as number) * (lim > 0 ? 1 : -1);
      let t = 0;
      while (Math.abs(t + step) <= Math.abs(lim) + 1e-9 && lim !== 0) {
        const over = scope(() => turn(c, a.o, a.axis, t + step).intersect(q).volume()) as unknown as number;
        if (over - base > a.collide) break;
        t += step;
      }
      return t;
    });
    case "cut": return scope(() => {
      // a piece less a tool: its bodies above `keep` mm3, largest first, and the volume it lost
      const m = asSolid(a.mesh), x = m.subtract(asSolid(a.tool)), lost = m.volume() - x.volume();
      return { lost, bodies: (x.decompose() as any[]).map((c) => [c, c.volume()] as [any, number]).filter(([, v]) => v > a.keep).sort((p, q) => q[1] - p[1]).map(([c]) => asMesh(c)) };
    });
    case "union2": return scope(() => asMesh(union((a.meshes as TriMesh[]).map(asSolid))));
  }
  throw new Error(`unknown job ${job.op}`);
}

