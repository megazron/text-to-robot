"""Human motion clips for wearables and humanoids, from real motion capture.

Reads the Quaternius Universal Animation Library (CC0 1.0, https://quaternius.com; glTF "AnimationLibrary_Godot_Standard"),
samples the clips at 30 fps, and turns each frame of the skeleton into anatomical angles in the body's own frame (shoulder
flexion and abduction, elbow flexion, hip flexion and abduction, knee and ankle flexion, neck yaw and pitch, spine flexion,
and the hips' height). Those angles are robot-neutral: packages/motion retargets them onto any robot's joints by what each
joint is (semantics.ts), clamps them to the robot's limits and reports what it had to clamp.

    python3 scripts/human_clips.py <path to gltf-universal-animation-library> [packages/motion/src/clips.ts]

The library itself is not in this repository; only the angles this writes are.
"""
import json, math, struct, sys
from pathlib import Path
import numpy as np

src = Path(sys.argv[1]); out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).resolve().parents[1] / "packages/motion/src/clips.ts"
gl = src / "glTF/AnimationLibrary_Godot_Standard.gltf"
g = json.loads(gl.read_text()); buf = (gl.parent / g["buffers"][0]["uri"]).read_bytes()
FPS = 30
# clip name in this repo -> (source clip, seconds to take or None for the whole clip)
TAKE = {"idle": "Idle_Loop", "walk": "Walk_Loop", "squat_hold": "Crouch_Idle_Loop", "punch": "Punch_Cross", "punch_jab": "Punch_Jab",
        "spell_enter": "Spell_Simple_Enter", "spell_idle": "Spell_Simple_Idle_Loop", "talk": "Idle_Talking_Loop", "interact": "Interact"}


def acc(i):
    a = g["accessors"][i]; v = g["bufferViews"][a["bufferView"]]
    n = {"SCALAR": 1, "VEC3": 3, "VEC4": 4, "MAT4": 16}[a["type"]]
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    return np.frombuffer(buf, dtype=np.float32, count=a["count"] * n, offset=off).reshape(a["count"], n) if n > 1 else np.frombuffer(buf, dtype=np.float32, count=a["count"], offset=off)


def qmat(q):
    x, y, z, w = q
    return np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]])


def slerp(a, b, s):
    d = float(np.dot(a, b))
    if d < 0: b = -b; d = -d
    if d > 0.9995: r = a + (b - a) * s; return r / np.linalg.norm(r)
    th = math.acos(d); return (math.sin((1 - s) * th) * a + math.sin(s * th) * b) / math.sin(th)


nodes = g["nodes"]; name = {n.get("name"): i for i, n in enumerate(nodes)}
parent = {}
for i, n in enumerate(nodes):
    for c in n.get("children", []): parent[c] = i
rest = [{"t": np.array(n.get("translation", [0, 0, 0]), float), "r": np.array(n.get("rotation", [0, 0, 0, 1]), float), "s": np.array(n.get("scale", [1, 1, 1]), float)} for n in nodes]


def globals_(trs):
    G = {}
    def get(i):
        if i in G: return G[i]
        M = np.eye(4); M[:3, :3] = qmat(trs[i]["r"]) * trs[i]["s"]; M[:3, 3] = trs[i]["t"]
        G[i] = get(parent[i]) @ M if i in parent else M
        return G[i]
    for i in range(len(nodes)): get(i)
    return G


def sample(anim, t):
    trs = [dict(r) for r in rest]
    for ch in anim["channels"]:
        smp = anim["samplers"][ch["sampler"]]; ts = acc(smp["input"]); vs = acc(smp["output"]); node = ch["target"]["node"]; path = ch["target"]["path"]
        k = int(np.searchsorted(ts, t, side="right")) - 1
        if k < 0: v = vs[0]
        elif k >= len(ts) - 1: v = vs[-1]
        else:
            s = (t - ts[k]) / max(1e-9, ts[k + 1] - ts[k])
            v = slerp(np.array(vs[k], float), np.array(vs[k + 1], float), s) if path == "rotation" else vs[k] + (vs[k + 1] - vs[k]) * s
        trs[node][{"translation": "t", "rotation": "r", "scale": "s"}[path]] = np.array(v, float)
    return globals_(trs)


P = lambda G, n: G[name["DEF-" + n]][:3, 3]
unit = lambda v: v / (np.linalg.norm(v) or 1)


def body_frame(G, a, b, top, bottom):
    up = unit(P(G, top) - P(G, bottom)); left = unit(P(G, a) - P(G, b))
    fwd = unit(np.cross(left, up)); left = unit(np.cross(up, fwd))
    return fwd, left, up


G0 = globals_(rest)
hip_rest = P(G0, "hips")[1] - min(P(G0, "toe.L")[1], P(G0, "foot.L")[1])
# the head's forward axis in its own frame, from the rest pose
f0, l0, u0 = body_frame(G0, "upper_arm.L", "upper_arm.R", "neck", "spine.001")
head_fwd_local = G0[name["DEF-head"]][:3, :3].T @ f0
CH = ["shoulder_flex_l", "shoulder_abd_l", "elbow_flex_l", "hip_flex_l", "hip_abd_l", "knee_flex_l", "ankle_flex_l",
      "shoulder_flex_r", "shoulder_abd_r", "elbow_flex_r", "hip_flex_r", "hip_abd_r", "knee_flex_r", "ankle_flex_r",
      "neck_yaw", "neck_pitch", "spine_flex", "root_dz"]


def angles(G, prev):
    # the heading frame: world up, and the pelvis's forward direction made level. A wearable's torso is one rigid shell held
    # upright, so limb angles against gravity are what its joints must make.
    fp, lp, up_ = body_frame(G, "thigh.L", "thigh.R", "spine.001", "hips")
    uc = np.array([0.0, 1.0, 0.0]); fc = unit(fp - (fp @ uc) * uc); lc = unit(np.cross(uc, fc))
    fh, lh, uh = fc, lc, uc
    out = {}
    for side, s in (("l", 1), ("r", -1)):
        S = side.upper()
        d = unit(P(G, f"forearm.{S}") - P(G, f"upper_arm.{S}")); e = unit(P(G, f"hand.{S}") - P(G, f"forearm.{S}"))
        df, do, du = d @ fc, s * (d @ lc), d @ uc
        out[f"shoulder_abd_{side}"] = math.asin(max(-1, min(1, do)))
        out[f"shoulder_flex_{side}"] = math.atan2(df, -du) if math.hypot(df, du) > 0.3 else prev.get(f"shoulder_flex_{side}", 0.0)
        out[f"elbow_flex_{side}"] = math.acos(max(-1, min(1, float(d @ e))))
        t = unit(P(G, f"shin.{S}") - P(G, f"thigh.{S}")); k = unit(P(G, f"foot.{S}") - P(G, f"shin.{S}")); ft = unit(P(G, f"toe.{S}") - P(G, f"foot.{S}"))
        tf, to, tu = t @ fh, s * (t @ lh), t @ uh
        out[f"hip_flex_{side}"] = math.atan2(tf, -tu)
        out[f"hip_abd_{side}"] = math.asin(max(-1, min(1, to)))
        out[f"knee_flex_{side}"] = math.acos(max(-1, min(1, float(t @ k))))
        out[f"ankle_flex_{side}"] = math.acos(max(-1, min(1, float(k @ ft))))
    h = G[name["DEF-head"]][:3, :3] @ head_fwd_local
    out["neck_yaw"] = math.atan2(h @ lc, h @ fc); out["neck_pitch"] = math.atan2(-(h @ uc), math.hypot(h @ fc, h @ lc))
    cu = unit(P(G, "neck") - P(G, "spine.001"))
    out["spine_flex"] = math.atan2(cu @ fh, cu @ uh)
    out["root_dz"] = (P(G, "hips")[1] - min(P(G, "toe.L")[1], P(G, "toe.R")[1], P(G, "foot.L")[1], P(G, "foot.R")[1]) - hip_rest) / hip_rest
    return out


anims = {a["name"]: a for a in g["animations"]}
res = {}
ankle0 = None
for key, clip in TAKE.items():
    a = anims[clip]; T = max(float(acc(s["input"]).max()) for s in a["samplers"])
    n = int(round(T * FPS)); prev = {}; rows = []
    for k in range(n + 1 if not clip.endswith("_Loop") else n):
        A = angles(sample(a, min(T, k / FPS)), prev); prev = A; rows.append(A)
    res[key] = {"source": clip, "seconds": round(T, 4), "rows": rows}
# ankle flexion relative to standing: the idle clip's first frame is the zero
# ankle flexion and the head's direction relative to standing still: the idle clip's average is the zero
idle = res["idle"]["rows"]
zero = {ch: sum(r[ch] for r in idle) / len(idle) for ch in ("ankle_flex_l", "ankle_flex_r", "neck_yaw", "neck_pitch")}
for c in res.values():
    for r in c["rows"]:
        for ch, z in zero.items(): r[ch] -= z
lines = ["// Generated by scripts/human_clips.py from the Quaternius Universal Animation Library (CC0 1.0). Do not edit.",
         "// Anatomical angles per frame (milliradians; root_dz in thousandths of the hip height), body frame, 30 fps.",
         f"export const CLIP_CHANNELS = {json.dumps(CH)} as const;",
         "export const CLIPS: Record<string, { source: string; seconds: number; frames: number; data: number[] }> = {"]
for key, c in res.items():
    data = [int(round(r[ch] * 1000)) for r in c["rows"] for ch in CH]
    lines.append(f"  {key}: {{ source: {json.dumps(c['source'])}, seconds: {c['seconds']}, frames: {len(c['rows'])}, data: {json.dumps(data, separators=(',', ':'))} }},")
lines.append("};")
out.write_text("\n".join(lines) + "\n")
for key, c in res.items():
    arr = np.array([[r[ch] for ch in CH] for r in c["rows"]])
    print(key, c["source"], len(c["rows"]), "frames;", " ".join(f"{ch}={math.degrees(arr[:, i].min()):.0f}..{math.degrees(arr[:, i].max()):.0f}" for i, ch in enumerate(CH) if ch != "root_dz"), f"root_dz={arr[:, -1].min():.3f}..{arr[:, -1].max():.3f}")
