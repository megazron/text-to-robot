#!/usr/bin/env python3
"""The Mark 43 designed directly as hard-surface armour, from reference photos of the movie suit, with no body or scanned model
underneath. Every part is a signed field: lofted sections along a bone give the form; plates, grooves and bevels are polygons laid on
that form and added to the field. Surfaces come out smooth because they are maths, not a mesh.
  x forward, y left, z up, mm, floor at 0.    python scripts/forge_mark43.py <out-dir> [--voxel 2] [--only torso,thigh]"""
import json, math, os, sys
import numpy as np, trimesh
from scipy.interpolate import PchipInterpolator
from scipy.ndimage import gaussian_filter
from skimage.measure import marching_cubes

H = 1850.0
J = {"hip_c": (0, 0, 1010), "neck": (0, 0, 1580), "shoulder": (0, 208, 1486), "elbow": (-8, 288, 1168), "wrist": (24, 352, 880), "hand_end": (58, 388, 700),
     "hip": (0, 92, 1010), "knee": (18, 112, 540), "ankle": (-4, 124, 88)}
J = {k: np.array(v, float) for k, v in J.items()}
RED, GOLD, STEEL, LENS = 0, 1, 2, 3
NAMES = {RED: "armour_red", GOLD: "armour_gold", STEEL: "armour_silver", LENS: "lens_glow"}


def poly_sd(P, V):
    V = np.asarray(V, float); W = np.roll(V, -1, axis=0); d = np.full(len(P), 1e9); inside = np.zeros(len(P), bool)
    for a, b in zip(V, W):
        e = b - a; w = P - a; t = np.clip((w @ e) / (e @ e), 0, 1); d = np.minimum(d, np.hypot(w[:, 0] - t * e[0], w[:, 1] - t * e[1]))
        c = (a[1] > P[:, 1]) != (b[1] > P[:, 1]); x = a[0] + (P[:, 1] - a[1]) / (b[1] - a[1] + 1e-12) * (b[0] - a[0])
        inside ^= c & (P[:, 0] < x)
    return np.where(inside, -d, d)


def seg_sd(P, a, b):
    a, b = np.asarray(a, float), np.asarray(b, float); e = b - a; w = P - a; t = np.clip((w @ e) / (e @ e), 0, 1)
    return np.hypot(w[:, 0] - t * e[0], w[:, 1] - t * e[1])


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1); return b + (a - b) * h - k * h * (1 - h)


def loft(tt, x, y, table, ends=None):
    """Section table rows (t, front, back, outer, inner, exponent): half widths either side of the bone."""
    T = np.array(table, float); f = [PchipInterpolator(T[:, 0], T[:, i]) for i in range(1, 6)]
    tc = np.clip(tt, T[0, 0], T[-1, 0]); fr, bk, ou, inn, n = [g(tc) for g in f]
    a = np.where(x > 0, fr, bk); b = np.where(y > 0, ou, inn)
    q = (np.abs(x / a) ** n + np.abs(y / b) ** n) ** (1 / n)
    d = (q - 1) * np.minimum(a, b)
    return np.maximum(np.maximum(d, T[0, 0] - tt), tt - T[-1, 0])


class Frame:
    def __init__(self, A, B, fwd=(1, 0, 0), side=1.0):
        self.A = np.asarray(A, float); self.u = (np.asarray(B, float) - A) / np.linalg.norm(np.asarray(B, float) - A)
        f = np.asarray(fwd, float); self.f = f - (f @ self.u) * self.u; self.f /= np.linalg.norm(self.f)
        self.l = np.cross(self.f, self.u) * -1.0   # outward (+y on the left side when the bone runs down)
        if self.l[1] * side < 0: self.l = -self.l

    def local(self, P):
        q = P - self.A; return q @ self.u, q @ self.f, q @ self.l


class Part:
    """A region on a voxel grid: `d` is the field (negative inside), `paint` a colour per voxel near the surface."""
    def __init__(self, name, lo, hi, v):
        self.name, self.v = name, v; self.lo = np.asarray(lo, float)
        self.ax = [np.arange(lo[i], hi[i] + v, v, dtype=np.float32) for i in range(3)]
        self.shape = tuple(len(a) for a in self.ax)

    def pts(self):
        g = np.meshgrid(*self.ax, indexing="ij"); return np.stack([a.ravel() for a in g], 1)

    def finish(self, d, sigma=0.7):
        self.d = gaussian_filter(d.reshape(self.shape).astype(np.float32), sigma / self.v * 1.0)
        self.near = np.nonzero(np.abs(self.d.ravel()) < 16)[0]
        self.col = np.zeros(self.d.size, np.uint8)
        self.P = self.pts()[self.near]

    def layer(self, sd, height=0.0, bevel=2.0, groove=1.2, width=1.0, colour=None):
        """Raises (or sinks) the surface over a mask with a bevelled edge, cuts a panel line round it, paints it."""
        f = self.d.ravel(); s = sd
        if height: f[self.near] -= height * np.clip(0.5 - s / bevel, 0, 1)
        if groove: f[self.near] += groove * np.exp(-(s / width) ** 2)
        if colour is not None: self.col[self.near[s < 0]] = colour

    def meshes(self, seam=0.3):
        out = []; f = self.d
        col = self.col.reshape(self.shape)
        for c in (RED, GOLD, STEEL, LENS):
            m = (col == c).astype(np.float32)
            if c != RED and not m.any(): continue
            e = gaussian_filter(m, 0.6) - 0.5                                   # positive on this colour
            if c == RED: e = np.where(self.nonred_any(col), e, 1.0)
            fld = np.maximum(f, -e * self.v * 2 + seam)
            if fld.min() >= 0: continue
            vv, tt, _, _ = marching_cubes(np.pad(fld, 1, constant_values=9.0), 0.0, spacing=(self.v,) * 3)
            mesh = trimesh.Trimesh(vv + self.lo - self.v, tt[:, ::-1], process=True)
            for k, comp in enumerate(c_ for c_ in mesh.split(only_watertight=False) if c_.area > 60):
                out.append((c, comp))
        return out

    def nonred_any(self, col): return col != RED

    def printable(self, opens, wall=3.0, seam=0.3, cell=(235, 205, 215)):
        """Hollow shell cut into bed-sized cells and per-colour panels: (colour, closed mesh). `opens` are fields, negative where the
        suit is open to the wearer."""
        f = np.maximum(self.d, -(self.d + wall))
        for o in opens: f = np.maximum(f, -o.reshape(self.shape))
        col = self.col.reshape(self.shape); ext = (np.array(self.shape) - 1) * self.v
        nc = [max(1, math.ceil(e / c)) for e, c in zip(ext, cell)]; edges = [self.lo[i] + np.linspace(0, ext[i], nc[i] + 1) for i in range(3)]; out = []
        for c in (RED, GOLD, STEEL, LENS):
            m = (col == c).astype(np.float32)
            if c != RED and not m.any(): continue
            e = gaussian_filter(m, 0.6) - 0.5
            if c == RED: e = np.where(col != RED, e, 1.0)
            fc = np.maximum(f, -e * self.v * 2 + seam)
            for ci in range(nc[0]):
                for cj in range(nc[1]):
                    for ck in range(nc[2]):
                        sl = []; cc = (ci, cj, ck)
                        for i in range(3):
                            a0 = max(0, int(np.searchsorted(self.ax[i], edges[i][cc[i]])) - 3); a1 = min(self.shape[i], int(np.searchsorted(self.ax[i], edges[i][cc[i] + 1])) + 4); sl.append(slice(a0, a1))
                        sl = tuple(sl); g = fc[sl].copy()
                        if g.min() >= 0: continue
                        gx = np.meshgrid(*[self.ax[i][sl[i]] for i in range(3)], indexing="ij", sparse=True)
                        for i in range(3):
                            if cc[i] > 0: g = np.maximum(g, edges[i][cc[i]] + seam - gx[i])
                            if cc[i] < nc[i] - 1: g = np.maximum(g, gx[i] - (edges[i][cc[i] + 1] - seam))
                        if g.min() >= 0: continue
                        vv, tt, _, _ = marching_cubes(np.pad(g, 1, constant_values=9.0), 0.0137, spacing=(self.v,) * 3)
                        o = np.array([self.ax[i][sl[i].start] for i in range(3)])
                        mesh = trimesh.Trimesh(vv + o - self.v, tt[:, ::-1], process=True)
                        for comp in mesh.split(only_watertight=False):
                            if not comp.is_watertight: trimesh.repair.fill_holes(comp)
                            if comp.is_watertight and abs(comp.volume) > 500:
                                if comp.volume < 0: comp.invert()
                                out.append((c, comp))
        return out


def unwrap(t, x, y, R):
    return np.c_[np.arctan2(y, x) * R, t]


def mirrored(P): return np.c_[P[:, 0], np.abs(P[:, 1])]


# ------------------------------------------------------------------ torso
TORSO = [(888, 44, 52, 50, 50, 2.2), (925, 84, 96, 104, 104, 2.4), (985, 98, 108, 134, 134, 2.5), (1050, 94, 100, 128, 128, 2.5), (1125, 92, 94, 120, 120, 2.5),
         (1190, 104, 100, 138, 138, 2.6), (1270, 126, 110, 166, 166, 2.7), (1360, 136, 118, 182, 182, 2.9), (1440, 118, 120, 184, 184, 3.0), (1510, 86, 104, 152, 152, 2.7), (1578, 62, 70, 84, 84, 2.4)]


def torso(v):
    p = Part("torso", (-160, -215, 870), (175, 215, 1592), v); P = p.pts()
    d = loft(P[:, 2], P[:, 0], P[:, 1], TORSO)
    p.finish(d)
    Q = p.P; y = np.abs(Q[:, 1]); z = Q[:, 2]; front = Q[:, 0] > 5; F = np.c_[y, z]
    onfront = lambda s: np.where(front, s, 99.0); onback = lambda s: np.where(~front, s, 99.0)
    # chest plate above a chevron hem, proud of the abdomen
    p.layer(onfront(poly_sd(F, [(-40, 1212), (60, 1228), (128, 1262), (190, 1322), (230, 1322), (230, 1620), (-40, 1620)])), 8.0, 3.0, 1.6, 1.2)
    # hexagon pec plates, sternum plate, upper chest plate
    p.layer(onfront(poly_sd(F, [(54, 1338), (100, 1446), (166, 1436), (182, 1352), (128, 1290), (80, 1294)])), 3.0, 2.5, 1.4, 1.0)
    p.layer(onfront(poly_sd(F, [(-40, 1302), (50, 1302), (74, 1284), (100, 1262), (62, 1232), (-40, 1220)])), 2.5, 2.5, 1.4, 1.0)
    p.layer(onfront(poly_sd(F, [(-40, 1530), (60, 1522), (94, 1468), (48, 1416), (-40, 1420)])), 2.0, 2.5, 1.4, 1.0)
    # collar: gold clavicle plates, steel ring under the throat
    p.layer(onfront(poly_sd(F, [(72, 1546), (128, 1518), (146, 1476), (108, 1464), (84, 1498)])), 3.0, 2.0, 1.4, 1.0, GOLD)
    p.layer(onfront(poly_sd(F, [(-40, 1552), (66, 1550), (80, 1512), (54, 1528), (-40, 1532)])), 2.0, 2.0, 1.2, 1.0, STEEL)
    # chest side: gold plate with steel ring and a red core
    p.layer(np.where(y > 112, poly_sd(F, [(150, 1296), (186, 1328), (214, 1298), (214, 1216), (182, 1198), (146, 1234)]), 99.0), 3.0, 2.0, 1.4, 1.0, GOLD)
    p.layer(np.where(y > 112, poly_sd(F, [(160, 1286), (186, 1310), (204, 1288), (204, 1226), (182, 1212), (158, 1240)]), 99.0), 1.0, 1.5, 1.0, 0.8, STEEL)
    p.layer(np.where(y > 112, poly_sd(F, [(170, 1274), (186, 1290), (194, 1278), (194, 1236), (182, 1226), (168, 1246)]), 99.0), -1.0, 1.5, 1.0, 0.8, RED)
    # abdomen: three chevron bands between gold flanks
    for z0, z1 in ((1206, 1168), (1164, 1126), (1122, 1084)):
        p.layer(onfront(poly_sd(F, [(-40, z0 - 26), (50, z0), (92, z0 - 2), (92, z1 - 2), (50, z1), (-40, z1 - 26)])), 4.0, 3.0, 1.6, 1.2)
    p.layer(onfront(poly_sd(F, [(96, 1214), (146, 1214), (150, 1150), (126, 1112), (146, 1072), (96, 1066), (104, 1112)])), 3.0, 2.0, 1.4, 1.0, GOLD)
    p.layer(onfront(poly_sd(F, [(104, 1130), (136, 1120), (126, 1092), (102, 1096)])), 1.5, 1.5, 1.2, 0.8, STEEL)
    p.layer(poly_sd(F, [(-40, 1064), (170, 1072), (170, 1058), (-40, 1050)]), -2.0, 1.5, 1.0, 0.8, STEEL)
    # pelvis: the codpiece running down between the thighs, hip discs
    p.layer(onfront(poly_sd(F, [(-40, 1044), (84, 1040), (102, 996), (66, 930), (28, 892), (-40, 888)])), 6.0, 3.0, 1.6, 1.2)
    p.layer(onfront(np.hypot(y - 116, z - 1010) - 20), 3.0, 2.0, 1.2, 1.0)
    # back: spine channel, shoulder blades, lumbar plate
    p.layer(onback(poly_sd(F, [(-40, 1490), (30, 1490), (30, 1140), (-40, 1140)])), -3.0, 2.5, 1.4, 1.0)
    p.layer(onback(poly_sd(F, [(40, 1470), (160, 1460), (172, 1300), (104, 1226), (40, 1256)])), 4.0, 3.0, 1.6, 1.2)
    p.layer(onback(poly_sd(F, [(-40, 1040), (112, 1040), (124, 960), (60, 900), (-40, 892)])), 3.0, 3.0, 1.4, 1.0)
    return p, []


def reactor(p):
    """recess, ring and lens at the centre of the chest"""
    Q = p.P; y, z = Q[:, 1], Q[:, 2]; r = np.hypot(y, z - 1375); fr = Q[:, 0] > 30
    p.layer(np.where(fr, r - 58, 99.0), 5.0, 2.0, 1.4, 1.0)
    p.layer(np.where(fr, r - 46, 99.0), -7.0, 2.0, 0.0, 1.0, STEEL)
    p.layer(np.where(fr, r - 36, 99.0), 0.0, 1.0, 1.0, 0.8)


# ------------------------------------------------------------------ limbs
def limb(name, A, B, table, v, pad=130, fwd=(1, 0, 0)):
    a, b = np.asarray(A, float), np.asarray(B, float); lo = np.minimum(a, b) - pad; hi = np.maximum(a, b) + pad
    p = Part(name, lo, hi, v); P = p.pts(); fr = Frame(a, b, fwd); t, x, y = fr.local(P)
    return p, fr, t, x, y, loft(t, x, y, table)


def upper_arm(v):
    L = np.linalg.norm(J["elbow"] - J["shoulder"])
    p, fr, t, x, y, d = limb("upper_arm", J["shoulder"], J["elbow"], [(30, 58, 58, 60, 54, 2.4), (110, 64, 64, 68, 58, 2.6), (220, 58, 58, 60, 52, 2.6), (L - 20, 48, 48, 50, 46, 2.4)], v, 150)
    # the pauldron: one big faceted shell over the shoulder
    pa = loft(t, x, y - 8, [(-70, 34, 34, 30, 26, 2.4), (-46, 66, 66, 60, 46, 3.2), (0, 74, 74, 72, 52, 3.4), (60, 70, 70, 68, 48, 3.4), (86, 58, 58, 58, 38, 3.0)])
    p.finish(np.minimum(d, pa))
    t, x, y = fr.local(p.P); U = unwrap(t, x, y, 70.0)
    p.layer(np.where(t > 96, 99.0, -1.0 + 0 * t), 0.0, 1.0, 0.0, 1.0)
    p.layer(poly_sd(U, [(-250, 96), (250, 96), (250, L - 44), (-250, L - 44)]), 0.0, 1.0, 1.4, 1.0, GOLD)
    p.layer(poly_sd(U, [(-40, 140), (60, 132), (84, 214), (20, 238), (-52, 214)]), 3.0, 2.0, 1.4, 1.0, GOLD)
    p.layer(poly_sd(U, [(-250, L - 42), (250, L - 42), (250, L - 10), (-250, L - 10)]), -3.0, 1.5, 1.2, 1.0, STEEL)
    for k in range(3):
        p.layer(poly_sd(U, [(-250, L - 38 + k * 10), (250, L - 38 + k * 10), (250, L - 34 + k * 10), (-250, L - 34 + k * 10)]), -2.0, 1.0, 0, 1.0)
    # pauldron facets
    p.layer(np.where(t < 92, poly_sd(U, [(-50, -32), (56, -32), (80, 46), (34, 78), (-50, 78), (-72, 30)]), 99.0), 3.0, 3.0, 1.4, 1.0)
    return p, []


def forearm(v):
    L = np.linalg.norm(J["wrist"] - J["elbow"])
    p, fr, t, x, y, d = limb("forearm", J["elbow"], J["wrist"], [(14, 46, 46, 50, 46, 2.4), (70, 62, 64, 68, 60, 3.0), (150, 60, 62, 62, 56, 3.2), (232, 48, 48, 50, 46, 3.0), (L - 12, 42, 42, 46, 42, 2.6)], v, 110)
    p.finish(d); t, x, y = fr.local(p.P); U = unwrap(t, x, y, 62.0)
    # the gold zig-zag down the forearm
    p.layer(poly_sd(U, [(-20, 62), (22, 62), (30, 128), (84, 178), (66, 214), (10, 160), (-46, 214), (-66, 180), (-22, 126)]), 2.5, 2.0, 1.4, 1.0, GOLD)
    p.layer(poly_sd(U, [(-250, 20), (250, 20), (250, 52), (-250, 52)]), 3.0, 2.0, 1.4, 1.0)
    p.layer(poly_sd(U, [(-250, 232), (250, 232), (250, L - 8), (-250, L - 8)]), 3.0, 2.5, 1.4, 1.0)
    p.layer(poly_sd(U, [(-250, 222), (250, 222), (250, 230), (-250, 230)]), -2.0, 1.0, 0.8, 1.0, GOLD)
    return p, []


def hand(v):
    wr, he = J["wrist"], J["hand_end"]
    p = Part("hand", np.minimum(wr, he) - 130, np.maximum(wr, he) + 130, v); P = p.pts()
    fr = Frame(wr, he); t, x, y = fr.local(P)
    # the palm faces the thigh: width runs forward (x), thickness sideways (y)
    d = loft(t, y, x, [(0, 42, 42, 54, 54, 3.0), (70, 40, 44, 66, 66, 3.4), (118, 32, 36, 66, 66, 3.2)])
    # four fingers, three bones each, curled in; a thumb
    def cap(a, b, r): return seg_sd3(P, a, b) - r
    for i, (o, ln) in enumerate(((48, 1.0), (16, 1.1), (-16, 1.04), (-46, 0.88))):
        pts = [np.array([118.0, 2.0, o])]; ang = 0.28
        for s_ in (52, 36, 28):
            s_ *= ln; n = pts[-1] + np.array([math.cos(ang) * s_, -math.sin(ang) * s_, 0.0]); pts.append(n); ang += 0.62
        for k in range(3):
            A, B = (fr.A + fr.u * q[0] + fr.l * q[1] + fr.f * q[2] for q in (pts[k], pts[k + 1]))
            d = smin(d, cap(A, B, (15.5, 14.0, 12.5)[k]), 1.2)
    th = [np.array([30.0, -26.0, 56.0]), np.array([78.0, -40.0, 76.0]), np.array([120.0, -40.0, 74.0])]
    for k in range(2):
        A, B = (fr.A + fr.u * q[0] + fr.l * q[1] + fr.f * q[2] for q in (th[k], th[k + 1]))
        d = smin(d, cap(A, B, (18.0, 14.5)[k]), 3.0)
    p.finish(d)
    t, x, y = fr.local(p.P); F = np.c_[x, t]
    back = y > 0
    p.layer(np.where(back, poly_sd(F, [(-48, 14), (48, 14), (54, 96), (-54, 96)]), 99.0), 3.0, 2.5, 1.4, 1.0)
    p.layer(np.where(back, poly_sd(F, [(-50, 100), (50, 100), (52, 118), (-52, 118)]), 99.0), 3.0, 2.0, 1.2, 1.0)
    p.layer(poly_sd(F, [(-60, -10), (60, -10), (60, 10), (-60, 10)]), -2.0, 1.5, 1.2, 1.0, STEEL)
    return p, []


def seg_sd3(P, a, b):
    a, b = np.asarray(a, float), np.asarray(b, float); e = b - a; w = P - a; t = np.clip((w @ e) / (e @ e), 0, 1)
    return np.linalg.norm(w - t[:, None] * e, axis=1)


def thigh(v):
    L = np.linalg.norm(J["knee"] - J["hip"])
    p, fr, t, x, y, d = limb("thigh", J["hip"], J["knee"], [(-10, 84, 88, 78, 62, 2.3), (70, 100, 104, 92, 76, 2.5), (200, 92, 94, 86, 76, 2.6), (340, 76, 76, 72, 66, 2.6), (L - 22, 64, 60, 62, 58, 2.6)], v, 130)
    p.finish(d); t, x, y = fr.local(p.P); U = unwrap(t, x, y, 85.0)
    # outer thigh: the big gold plate with its red inset
    p.layer(poly_sd(U, [(-10, 96), (70, 44), (140, 92), (136, 232), (70, 306), (14, 306), (-30, 214)]), 4.0, 3.0, 1.6, 1.2, GOLD)
    p.layer(poly_sd(U, [(30, 142), (78, 104), (112, 142), (96, 214), (52, 232)]), -3.0, 2.0, 1.2, 1.0, RED)
    # front thigh plate, gold band above the knee, steel knee guard
    p.layer(poly_sd(U, [(-120, 60), (-30, 60), (-46, 300), (-120, 318)]), 3.0, 3.0, 1.4, 1.0)
    p.layer(poly_sd(U, [(-260, 342), (260, 342), (260, 382), (-260, 382)]), 2.5, 2.0, 1.4, 1.0, GOLD)
    p.layer(np.where(x > -10, poly_sd(U, [(-76, 392), (76, 392), (94, L + 12), (-94, L + 12)]), 99.0), 3.0, 2.0, 1.4, 1.0, STEEL)
    return p, []


def shin(v):
    L = np.linalg.norm(J["ankle"] - J["knee"])
    p, fr, t, x, y, d = limb("shin", J["knee"], J["ankle"], [(14, 60, 56, 60, 56, 2.7), (80, 66, 80, 68, 62, 2.9), (190, 62, 82, 64, 58, 3.0), (310, 52, 60, 54, 50, 3.0), (L - 14, 54, 62, 56, 52, 3.2)], v, 120)
    p.finish(d); t, x, y = fr.local(p.P); U = unwrap(t, x, y, 66.0)
    p.layer(np.where(x > 0, poly_sd(U, [(-58, 20), (58, 20), (66, 96), (28, 118), (-28, 118), (-66, 96)]), 99.0), 4.0, 3.0, 1.6, 1.2)
    p.layer(poly_sd(U, [(66, 110), (98, 110), (92, 244), (72, 210)]), 2.0, 2.0, 1.2, 1.0, GOLD)
    p.layer(poly_sd(U, [(-98, 110), (-66, 110), (-72, 210), (-92, 244)]), 2.0, 2.0, 1.2, 1.0, GOLD)
    p.layer(np.where(x > 0, poly_sd(U, [(-42, 132), (42, 132), (36, 300), (0, 330), (-36, 300)]), 99.0), 3.0, 3.0, 1.6, 1.2)
    p.layer(poly_sd(U, [(-260, 352), (260, 352), (260, 366), (-260, 366)]), -2.0, 1.5, 1.2, 1.0)
    return p, []


def foot(v):
    an = J["ankle"]
    p = Part("foot", (an[0] - 120, an[1] - 90, 0), (an[0] + 215, an[1] + 90, 150), v); P = p.pts()
    x, y, z = P[:, 0] - an[0], P[:, 1] - an[1], P[:, 2]
    # a boot along x: rows (x, top, sole, half width, exp) -> section in y, z
    T = np.array([(-96, 92, 0, 44, 3), (-50, 118, 0, 56, 3), (10, 112, 0, 60, 3), (70, 74, 0, 60, 3.2), (130, 52, 0, 56, 3.2), (178, 34, 0, 42, 3)], float)
    ip = [PchipInterpolator(T[:, 0], T[:, i]) for i in range(1, 5)]; xc = np.clip(x, -96, 178); top, sole, w, n = [g(xc) for g in ip]
    zc, zh = (top + sole) / 2, (top - sole) / 2
    q = (np.abs(y / w) ** n + np.abs((z - zc) / zh) ** n) ** (1 / n); d = (q - 1) * np.minimum(w, zh)
    d = np.maximum(np.maximum(d, -96 - x), x - 178); d = np.maximum(d, 2.0 - z)
    p.finish(d)
    Q = p.P; x, y, z = Q[:, 0] - an[0], Q[:, 1] - an[1], Q[:, 2]
    S = np.c_[x, z]
    p.layer(poly_sd(S, [(-120, 0), (200, 0), (200, 16), (-120, 16)]), -1.5, 1.5, 1.2, 1.0, STEEL)
    p.layer(np.where(z > 24, poly_sd(np.c_[y, x], [(-40, 60), (40, 60), (30, 150), (-30, 150)]), 99.0), 2.5, 2.5, 1.4, 1.0)
    return p, []


def joint_mech(v):
    """The dark machinery between the plates: ribbed steel at every joint, so no gap ever shows through."""
    parts = []
    S = [("shoulder", J["shoulder"] + [0, -46, -6], J["shoulder"] + [0, 24, -10], 60), ("elbow", J["elbow"] + (J["shoulder"] - J["elbow"]) * 0.1, J["elbow"] + (J["wrist"] - J["elbow"]) * 0.09, 52),
         ("wrist", J["wrist"] + (J["elbow"] - J["wrist"]) * 0.07, J["wrist"] + (J["hand_end"] - J["wrist"]) * 0.1, 40), ("hip", J["hip"] + [0, -8, 26], J["hip"] + (J["knee"] - J["hip"]) * 0.08, 66),
         ("knee", J["knee"] + (J["hip"] - J["knee"]) * 0.07, J["knee"] + (J["ankle"] - J["knee"]) * 0.07, 62), ("ankle", J["ankle"] + [0, 0, 30], J["ankle"] + [0, 0, -18], 48)]
    for n, a, b, r in S:
        p = Part("mech_" + n, np.minimum(a, b) - r - 14, np.maximum(a, b) + r + 14, v); P = p.pts()
        d = seg_sd3(P, a, b) - r; u = (b - a) / np.linalg.norm(b - a); d = d + 1.1 * np.sin((P - a) @ u * 0.9)
        p.finish(d, 0.3); p.col[:] = STEEL; parts.append((n, p))
    return parts


def neck_waist(v):
    p = Part("core", (-120, -130, 1040), (120, 130, 1640), v); P = p.pts(); z = P[:, 2]
    d = seg_sd3(P, (0, 0, 1520), (0, 0, 1610)) - 62 + 1.0 * np.sin(z * 0.8); p.finish(d, 0.3); p.col[:] = STEEL
    return p


Z_CHIN = 1566.0
HEAD = [(0, 92, 20, 40, 40, 2.2), (22, 118, 70, 72, 72, 2.4), (66, 126, 104, 86, 86, 2.5), (118, 124, 118, 97, 97, 2.5), (166, 120, 124, 103, 103, 2.5), (214, 110, 126, 104, 104, 2.4),
        (252, 86, 112, 92, 92, 2.3), (276, 52, 76, 60, 60, 2.2), (288, 12, 16, 14, 14, 2.0)]


def head(v):
    """The helmet, from the reference: one smooth shell, gold mask, red wedge, eyes, mouth line, ear discs, crown ridge."""
    p = Part("head", (-150, -125, Z_CHIN - 14), (150, 125, Z_CHIN + 302), v); P = p.pts()
    p.finish(loft(P[:, 2] - Z_CHIN, P[:, 0], P[:, 1], HEAD), 0.5)
    Q = p.P; x = Q[:, 0]; y = np.abs(Q[:, 1]); z = Q[:, 2] - Z_CHIN; F = np.c_[y, z]; S = np.c_[x, z]; fr = x > 18
    face = lambda s: np.where(fr, s, 99.0); line = lambda a, b, dp=1.3, w=1.1: p.layer(face(seg_sd(F, a, b)), 0.0, 1.0, dp, w)
    # the mask
    p.layer(face(poly_sd(F, [(-40, 8), (34, 8), (52, 42), (74, 72), (94, 122), (102, 178), (97, 214), (80, 262), (-40, 268)])), 3.5, 2.0, 1.8, 1.2, GOLD)
    p.layer(face(poly_sd(F, [(-40, 280), (66, 280), (30, 208), (-40, 194)])), -3.5, 2.0, 1.6, 1.2, RED)     # forehead wedge
    # eyes: sunk, then lit
    eye = [(14, 158), (28, 168), (82, 184), (88, 174), (66, 156), (28, 150)]
    p.layer(face(poly_sd(F, [(a * 1.06 - 1, (b - 166) * 1.5 + 166) for a, b in eye])), -3.0, 2.0, 1.2, 1.0)
    p.layer(face(poly_sd(F, eye)), -2.0, 1.0, 0.0, 1.0, LENS)
    # mask lines: brow, nose, cheek
    line((26, 206), (46, 262)); line((84, 190), (92, 214)); line((30, 150), (40, 110)); line((40, 110), (74, 72)); line((88, 172), (84, 118)); line((84, 118), (66, 74))
    # mouth and chin
    p.layer(face(poly_sd(F, [(-40, 62), (44, 66), (58, 80), (62, 74), (48, 56), (-40, 52)])), -3.0, 1.5, 1.0, 0.9)
    p.layer(face(poly_sd(F, [(-40, 46), (44, 50), (34, 14), (-40, 12)])), 2.5, 2.0, 1.4, 1.0)
    # side of the head: ear disc, jaw plate, crown line
    sd_ = y > 40; ear = np.hypot(x + 6, z - 158)
    p.layer(np.where(sd_, ear - 37, 99.0), 4.0, 2.0, 1.4, 1.0); p.layer(np.where(sd_, ear - 25, 99.0), -2.0, 1.5, 1.0, 0.9)
    p.layer(np.where(sd_ & (x < 60), poly_sd(S, [(-110, 202), (56, 214), (70, 262), (-90, 268)]), 99.0), 2.0, 2.5, 1.2, 1.0)
    p.layer(np.where(sd_ & ~fr, poly_sd(S, [(-120, 28), (6, 34), (20, 112), (-120, 120)]), 99.0), 2.0, 2.5, 1.2, 1.0)
    # the raised ridge over the crown
    p.layer(np.where(z > 220, poly_sd(np.c_[y, x], [(-30, -130), (26, -130), (34, 40), (-30, 50)]), 99.0), 2.5, 2.5, 1.2, 1.0)
    return p, []


def lenses():
    """the glowing parts: reactor core, palm repulsors"""
    d = trimesh.creation.cylinder(radius=33, height=3, sections=64); d.apply_transform(trimesh.transformations.rotation_matrix(math.pi / 2, [0, 1, 0])); d.apply_translation([141, 0, 1375])
    return [d]


BUILD = {"head": head, "torso": torso, "upper_arm": upper_arm, "forearm": forearm, "hand": hand, "thigh": thigh, "shin": shin, "foot": foot}


def chunks(m, limit=60000):
    """A piece in the pack holds at most 65535 vertices: a dense mesh is cut into runs of faces."""
    f = np.asarray(m.faces); v = np.asarray(m.vertices)
    if len(v) <= limit: yield v, f; return
    per = limit // 3
    order = np.argsort(v[f].mean(1) @ np.array([0.13, 0.31, 1.0]))
    for c0 in range(0, len(f), per):
        ff = f[order[c0:c0 + per]]; u, inv = np.unique(ff, return_inverse=True); yield v[u], inv.reshape(-1, 3)


def pack(items, out):
    blob = bytearray(); rows = []
    for name, link, mat, region, m in items:
        for k, (v, f) in enumerate(chunks(m)):
            lo = v.min(0); step = np.maximum((v.max(0) - lo) / 65535, 1e-6); q = np.round((v - lo) / step).astype("<u2"); ov = len(blob); blob += q.tobytes(); of = len(blob); blob += f.astype("<u2").tobytes()
            rows.append({"name": f"{name}_{k}", "link": link, "material": mat, "region": region, "lo": lo.tolist(), "step": step.tolist(), "nv": len(v), "nf": len(f), "ov": ov, "of": of})
    json.dump({"pieces": rows}, open(out + "/mark43_pack.json", "w")); open(out + "/mark43_pack.bin", "wb").write(blob)
    print(len(rows), "pieces", sum(r["nf"] for r in rows), "faces", flush=True)


def openings(k, p):
    """where each part is open to the wearer"""
    P = p.pts(); cyl = lambda a, b, r: seg_sd3(P, a, b) - r
    if k == "torso":
        o = [cyl((0, 0, 1500), (0, 0, 1700), 68)]
        for s_ in (1, -1):
            o.append(cyl((0, s_ * 120, 1476), (0, s_ * 300, 1476), 66)); o.append(cyl((0, s_ * 84, 985), (0, s_ * 110, 740), 74))
        return o
    if k == "head":
        return [cyl((0, 0, 1400), (0, 0, Z_CHIN + 40), 76)]
    if k == "upper_arm":
        a = J["shoulder"]; return [cyl(a + [0, -130, 0], a + [0, 8, -8], 58), cyl(J["elbow"] + (J["elbow"] - a) * 0.3, J["elbow"] + (a - J["elbow"]) * 0.2, 42)]
    if k == "forearm":
        e, w = J["elbow"], J["wrist"]; return [cyl(e + (e - w) * 0.3, e + (w - e) * 0.045, 40), cyl(w + (w - e) * 0.3, w + (e - w) * 0.03, 36)]
    if k == "hand":
        w, h = J["wrist"], J["hand_end"]; return [cyl(w + (w - h) * 0.4, w + (h - w) * 0.02, 34)]
    if k == "thigh":
        a, b = J["hip"], J["knee"]; return [cyl(a + (a - b) * 0.3, a + (b - a) * -0.06, 62), cyl(b + (b - a) * 0.3, b + (a - b) * 0.04, 52)]
    if k == "shin":
        a, b = J["knee"], J["ankle"]; return [cyl(a + (a - b) * 0.3, a + (b - a) * 0.02, 50), cyl(b + (b - a) * 0.3, b + (a - b) * 0.02, 44)]
    if k == "foot":
        return [cyl(J["ankle"] + [0, 0, 400], J["ankle"] + [0, 0, -30], 40)]
    return []


MECH_LINK = {"shoulder": "upper_arm", "elbow": "forearm", "wrist": "hand", "hip": "thigh", "knee": "shin", "ankle": "foot"}


def palm_lens():
    fr = Frame(J["wrist"], J["hand_end"]); d = trimesh.creation.cylinder(radius=22, height=2.5, sections=48)
    R = np.eye(4); R[:3, 0] = fr.f; R[:3, 1] = np.cross(-fr.l, fr.f); R[:3, 2] = -fr.l; R[:3, 3] = fr.A + fr.u * 76 - fr.l * 41; d.apply_transform(R); return d


def export_print(out, v):
    os.makedirs(out, exist_ok=True); meta = []
    def put(name, link, mat, region, m):
        m.export(f"{out}/pack_{name}.stl"); meta.append({"name": name, "link": link, "material": mat, "region": region})
    for k in BUILD:
        p, _ = BUILD[k](v)
        if k == "torso": reactor(p)
        for i, (c, m) in enumerate(p.printable(openings(k, p), wall=2.2 if k == "head" else 3.0)):
            if k == "torso": put(f"torso_{i}", "pelvis", NAMES[c], "torso", m); continue
            if k == "head": put(f"helmet_{i}", "helmet_faceplate" if c in (GOLD, LENS) else "head", NAMES[c], "head", m); continue
            put(f"left_{k}_{i}", f"left_{k}", NAMES[c], f"left_{k}", m)
            r = m.copy(); r.vertices = np.asarray(r.vertices) * [1, -1, 1]; r.invert(); put(f"right_{k}_{i}", f"right_{k}", NAMES[c], f"right_{k}", r)
        print(k, len(meta), flush=True); del p
    for n, p in joint_mech(v):
        P = p.pts(); ax = {"shoulder": (J["shoulder"] + [0, -160, 0], J["shoulder"] + [0, 110, -14]), "elbow": (J["shoulder"], J["wrist"]), "wrist": (J["elbow"], J["hand_end"]), "hip": (J["hip"] + [0, 0, 200], J["knee"]), "knee": (J["hip"], J["ankle"]), "ankle": (J["ankle"] + [0, 0, 300], J["ankle"] + [0, 0, -120])}[n]
        r = {"shoulder": 52, "elbow": 44, "wrist": 34, "hip": 58, "knee": 54, "ankle": 42}[n]
        for i, (c, m) in enumerate(p.printable([seg_sd3(P, ax[0], ax[1]) - r], wall=2.5, cell=(400, 400, 400))):
            put(f"left_mech_{n}_{i}", f"left_{MECH_LINK[n]}", "armour_mech", f"mech_left_{n}", m)
            q = m.copy(); q.vertices = np.asarray(q.vertices) * [1, -1, 1]; q.invert(); put(f"right_mech_{n}_{i}", f"right_{MECH_LINK[n]}", "armour_mech", f"mech_right_{n}", q)
    put("reactor_lens", "pelvis", "lens_glow", "torso", lenses()[0])
    l = palm_lens(); put("left_palm_lens", "left_hand", "lens_glow", "left_hand", l)
    r = l.copy(); r.vertices = np.asarray(r.vertices) * [1, -1, 1]; r.invert(); put("right_palm_lens", "right_hand", "lens_glow", "right_hand", r)
    json.dump(meta, open(f"{out}/pack.json", "w"), indent=0); print(len(meta), "pieces", flush=True)


def export_anim(out, v):
    """Per-link halves for the suit-up film: rear halves swing open, so each part is cut at its own bone."""
    os.makedirs(out, exist_ok=True); man = []
    def put(name, link, mat, m):
        m.export(f"{out}/{name}.ply"); man.append({"file": f"{name}.ply", "link": link, "material": mat})
    def halves(tag, link, mat, m, x0):
        fc = m.triangles_center; centre = link in ("pelvis", "head")
        sels = (("f", fc[:, 0] >= x0), ("bL", (fc[:, 0] < x0) & (fc[:, 1] >= 0)), ("bR", (fc[:, 0] < x0) & (fc[:, 1] < 0))) if centre else (("f", fc[:, 0] >= x0), ("b", fc[:, 0] < x0))
        for h, sel in sels:
            if sel.any(): put(f"{tag}_{h}", f"{link}:{h}", mat, m.submesh([np.nonzero(sel)[0]], append=True))
    for k in BUILD:
        p, _ = BUILD[k](v)
        if k == "torso": reactor(p)
        for i, (c, m) in enumerate(p.meshes()):
            if k == "torso": halves(f"torso{i}", "pelvis", NAMES[c], m, 0.0)
            elif k == "head":
                if c in (GOLD, LENS): put(f"mask{i}", "helmet_faceplate", NAMES[c], m)
                else: halves(f"head{i}", "head", NAMES[c], m, -20.0)
            else:
                x0 = float(np.mean(m.vertices[:, 0]))
                for sd, nm in ((1, "left"), (-1, "right")):
                    q = m.copy()
                    if sd < 0: q.vertices = np.asarray(q.vertices) * [1, -1, 1]; q.invert()
                    if k in ("hand", "foot"): put(f"{nm}_{k}{i}", f"{nm}_{k}", NAMES[c], q)
                    else: halves(f"{nm}_{k}{i}", f"{nm}_{k}", NAMES[c], q, x0)
        print(k, flush=True); del p
    for n, p in joint_mech(v):
        for i, (c, m) in enumerate(p.meshes()):
            put(f"left_mech_{n}{i}", f"left_{MECH_LINK[n]}", "armour_mech", m); q = m.copy(); q.vertices = np.asarray(q.vertices) * [1, -1, 1]; q.invert(); put(f"right_mech_{n}{i}", f"right_{MECH_LINK[n]}", "armour_mech", q)
    for i, (c, m) in enumerate(neck_waist(v).meshes()): put(f"core{i}", "pelvis", "armour_mech", m)
    put("reactor_lens", "pelvis:f", "lens_glow", lenses()[0])
    json.dump({"pieces": man, "joints": {k: [float(x) for x in val] for k, val in J.items()}, "chin": Z_CHIN}, open(f"{out}/anim.json", "w")); print(len(man), "objects", flush=True)


def export_ply(items, out):
    """one binary PLY per colour, for the Blender studio"""
    by = {}
    for name, link, mat, region, m in items: by.setdefault(mat, []).append(m)
    for mat, ms in by.items(): trimesh.util.concatenate(ms).export(f"{out}/{mat}.ply")


def main():
    out = sys.argv[1]; v = float(sys.argv[sys.argv.index("--voxel") + 1]) if "--voxel" in sys.argv else 2.0
    if "--print" in sys.argv: return export_print(out, v)
    if "--anim" in sys.argv: return export_anim(out, v)
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else list(BUILD)
    os.makedirs(out, exist_ok=True); items = []
    for k in only:
        p, extra = BUILD[k](v)
        if k == "torso": reactor(p)
        ms = p.meshes()
        for i, (c, m) in enumerate(ms):
            if k in ("torso", "head"): items.append((f"{k}_{i}", "pelvis" if k == "torso" else "head", NAMES[c], k, m)); continue
            items.append((f"left_{k}_{i}", f"left_{k}", NAMES[c], f"left_{k}", m))
            r = m.copy(); r.vertices = np.asarray(r.vertices) * [1, -1, 1]; r.invert()
            items.append((f"right_{k}_{i}", f"right_{k}", NAMES[c], f"right_{k}", r))
        print(k, len(ms), "meshes", flush=True)
    for n, p in joint_mech(v):
        for i, (c, m) in enumerate(p.meshes()):
            items.append((f"left_mech_{n}_{i}", "pelvis", "armour_mech", "mech", m))
            r = m.copy(); r.vertices = np.asarray(r.vertices) * [1, -1, 1]; r.invert(); items.append((f"right_mech_{n}_{i}", "pelvis", "armour_mech", "mech", r))
    for i, (c, m) in enumerate(neck_waist(v).meshes()): items.append((f"core_{i}", "pelvis", "armour_mech", "mech", m))
    for i, m in enumerate(lenses()): items.append((f"lens_{i}", "pelvis", "lens_glow", "torso", m))
    pack(items, out); export_ply(items, out)


if __name__ == "__main__":
    main()
