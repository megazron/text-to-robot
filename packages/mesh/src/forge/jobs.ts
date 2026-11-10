// The solid jobs of the forge's pool (pool.ts): what each worker answers, and what runs here when there is no pool.
import { scope, compose, asSolid, asMesh, turn, union, clipUnion, overlaps, bbox, type P3 } from "./geo.ts";
import type { TriMesh } from "./mc.ts";
import type { Job } from "./pool.ts";
import { makePart, type Part } from "./doors.ts";
import { forgeOnePart, forgeOneMech } from "./mark43.ts";

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
    case "clear": return scope(() => {
      // a run of a door's angles, in order: the first at which a turned solid of the door meets another link's by more than `touch`
      type T = [P3, P3, number];
      type L = { mesh: Part[]; inner?: T; outer?: T };
      // the link as the measuring step builds it: its parts (each turned by `inner`) composed, then turned by `outer`
      const made = (m: L) => { const c = compose(m.mesh.map((x) => (m.inner ? turn(makePart(x), ...m.inner) : makePart(x)))); return m.outer ? turn(c, ...m.outer) : c; };
      // each other link kept as its posed parts: a turned door meets only the parts its box reaches, and its overlap with the link is its
      // overlap with those parts (the rest lie outside its box), so each test intersects a few pieces, not a whole torso
      const posed = (m: L) => m.mesh.map((x) => { const p = m.inner ? turn(makePart(x), ...m.inner) : makePart(x); return m.outer ? turn(p, ...m.outer) : p; });
      const mine = (a.mine as L[]).map(made), others = (a.others as (L & { name: string })[]).map((o) => { const ps = posed(o), bs = ps.map((p) => bbox(p)); return { name: o.name, ps, bs, box: bs.reduce((u, b) => [[Math.min(u[0][0], b[0][0]), Math.min(u[0][1], b[0][1]), Math.min(u[0][2], b[0][2])], [Math.max(u[1][0], b[1][0]), Math.max(u[1][1], b[1][1]), Math.max(u[1][2], b[1][2])]] as [P3, P3], [[Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]] as [P3, P3]) }; });
      const angles = a.angles as number[];
      for (let i = 0; i < angles.length; i++) {
        const hit = scope(() => {
          for (const m of mine) {
            const t = turn(m, a.a, a.up, a.sign * angles[i]), bb = bbox(t);
            for (const o of others) {
              if (!overlaps(bb, o.box)) continue;
              const near = o.ps.filter((_, q) => overlaps(bb, o.bs[q]));
              if (!near.length) continue;
              const v = t.intersect(compose(near)).volume();
              if (v > a.touch) return [o.name, v] as [string, number];
            }
          }
          return null;
        }) as unknown as [string, number] | null;
        if (hit) return { k: a.first + i, hit };
      }
      return { k: -1, hit: null };
    });
    case "meets": return scope(() => {
      // the coarse pass of a door's staged trim (fit_doors.trim_stages): which of `qs` the door's light shell meets at any of `angles`
      const light = compose((a.lightParts as TriMesh[]).map(asSolid)).simplify(0.3), turned = (a.angles as number[]).map((t) => turn(light, a.o, a.e, a.sg * t)), tbb = turned.map((x) => bbox(x));
      const out: number[] = [];
      (a.qs as { mesh: TriMesh; simplify?: number; turns: [P3, P3, number][] }[]).forEach((q, k) => scope(() => {
        let x = asSolid(q.mesh); if (q.simplify) x = x.simplify(q.simplify);
        for (const t of q.turns) x = turn(x, t[0], t[1], t[2]);
        const qb = bbox(x);
        if (!overlaps(qb, a.bb)) return;
        for (let i = 0; i < turned.length; i++) if (overlaps(tbb[i], qb) && (scope(() => turned[i].intersect(x).volume()) as unknown as number) > 0.05) { out.push(a.first + k); return; }
      }));
      return out;
    });
    case "forgePart": return forgeOnePart(a.k, a.params);
    case "forgeMech": return forgeOneMech(a.n, a.params, a.d);
    case "union2": return scope(() => asMesh(union((a.meshes as TriMesh[]).map(asSolid))));
  }
  throw new Error(`unknown job ${job.op}`);
}

