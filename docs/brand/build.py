"""Writes the Text to Robot and Robot Studio logo files from one geometry.

    python docs/brand/build.py     # rewrite the SVGs in docs/brand
    python docs/brand/export.py    # render the PNGs (Playwright with Chromium)

Both products use this file. PRODUCT picks which family member this folder holds;
family.svg always shows both. The arm is drawn on a 512 unit canvas from a few
primitives: a base, two links, two ring joints and an open gripper. The favicon
cuts are drawn again on their own pixel grid.
The wordmark is Sora, outlined from fonts/ (SIL Open Font License 1.1, see fonts/OFL.txt).
"""
import math
import pathlib
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

PRODUCT = "ttr"  # "ttr" (Text to Robot) or "studio" (Robot Studio)
HERE = pathlib.Path(__file__).resolve().parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE

GREEN, CYAN, VOID, INK = "#3dfa46", "#7ffcd5", "#06110a", "#e9fff0"
MUTED, PAPER, FOREST, TEAL = "#9fb8a6", "#f3faf5", "#118a2a", "#0e8c74"
NAMES = {"ttr": ("text to", "robot", "Text to Robot", "Describe a robot. Get one you can simulate, wire and print."),
         "studio": ("robot", "studio", "Robot Studio", "Drag a robot together. Text to Robot does the engineering.")}


def n(v):
    return f"{v:.2f}".rstrip("0").rstrip(".")


# ---------------------------------------------------------------- the arm
# Arm units, y up, base centre at the origin.
J1, J2, TIP, W = (0.0, 40.0), (95.0, 175.0), (205.0, 135.0), 34.0


def arm_prims(w=W, holes=True):
    """Primitives: ('rect', x0, y0, x1, y1, r) rounded at the bottom, ('dome', c, r),
    ('line', points, width), ('disc', c, r). The ring holes come back separately."""
    d = (TIP[0] - J2[0], TIP[1] - J2[1])
    length = math.hypot(*d)
    d = (d[0] / length, d[1] / length)
    nn = (-d[1], d[0])

    def finger(s):
        return [TIP, (TIP[0] + d[0] * 30 + s * nn[0] * 26, TIP[1] + d[1] * 30 + s * nn[1] * 26),
                (TIP[0] + d[0] * 62 + s * nn[0] * 18, TIP[1] + d[1] * 62 + s * nn[1] * 18)]

    k = w / W
    prims = [("rect", -80, -30, 80, 0, 9), ("dome", (0, 0), 46),
             ("line", [J1, J2], w), ("line", [J2, TIP], w * 0.9),
             ("line", finger(1), 11 * k), ("line", finger(-1), 11 * k),
             ("disc", J1, 26 * k), ("disc", J2, 26 * k), ("disc", TIP, 20 * k)]
    hs = [("disc", J1, 9), ("disc", J2, 9)] if holes else []
    return prims, hs


def bounds(prims):
    xs, ys = [], []
    for p in prims:
        if p[0] == "rect":
            xs += [p[1], p[3]]
            ys += [p[2], p[4]]
        elif p[0] in ("disc", "dome"):
            (cx, cy), r = p[1], p[2]
            xs += [cx - r, cx + r]
            ys += [cy + r, cy if p[0] == "dome" else cy - r]
        else:
            for x, y in p[1]:
                xs += [x - p[2] / 2, x + p[2] / 2]
                ys += [y - p[2] / 2, y + p[2] / 2]
    return min(xs), min(ys), max(xs), max(ys)


class Fit:
    """Maps arm units (y up) into a box in output units (y down), keeping the aspect ratio."""

    def __init__(self, prims, x0, y0, x1, y1, snap=None):
        bx = bounds(prims)
        self.s = min((x1 - x0) / (bx[2] - bx[0]), (y1 - y0) / (bx[3] - bx[1]))
        self.tx = (x0 + x1) / 2 - (bx[0] + bx[2]) / 2 * self.s
        self.ty = (y0 + y1) / 2 + (bx[1] + bx[3]) / 2 * self.s
        if snap is not None:
            # put the outer edge of the base's gap (left and bottom) on whole pixels
            ax, ay = self.p(prims[0][1], prims[0][2])
            self.tx += round(ax - snap) - (ax - snap)
            self.ty += round(ay + snap) - (ay + snap)

    def p(self, x, y):
        return self.tx + x * self.s, self.ty - y * self.s


def draw(prims, fit, colour, grow=0.0):
    """SVG for the primitives in one colour. grow > 0 pushes every edge out by that many
    output units (a round buffer): that is how the gap round the arm is cut."""
    s, out = fit.s, []
    edge = f' stroke="{colour}" stroke-width="{n(2 * grow)}" stroke-linejoin="round"' if grow else ""
    for p in prims:
        if p[0] == "rect":
            _, x0, y0, x1, y1, r = p
            (ax, ay), (bx, by), r = fit.p(x0, y1), fit.p(x1, y0), r * s
            d = (f"M{n(ax)} {n(ay)}H{n(bx)}V{n(by - r)}A{n(r)} {n(r)} 0 0 1 {n(bx - r)} {n(by)}"
                 f"H{n(ax + r)}A{n(r)} {n(r)} 0 0 1 {n(ax)} {n(by - r)}Z")
            out.append(f'<path d="{d}" fill="{colour}"{edge}/>')
        elif p[0] == "dome":
            (cx, cy), r = fit.p(*p[1]), p[2] * s
            # runs a little into the base below it, so no hairline shows at the seam
            out.append(f'<path d="M{n(cx - r)} {n(cy)}A{n(r)} {n(r)} 0 0 1 {n(cx + r)} {n(cy)}V{n(cy + 2 * s)}H{n(cx - r)}Z" fill="{colour}"{edge}/>')
        elif p[0] == "disc":
            (cx, cy), r = fit.p(*p[1]), p[2] * s + grow
            out.append(f'<circle cx="{n(cx)}" cy="{n(cy)}" r="{n(r)}" fill="{colour}"/>')
        else:
            d = "M" + "L".join(f"{n(x)} {n(y)}" for x, y in (fit.p(*q) for q in p[1]))
            out.append(f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{n(p[2] * s + 2 * grow)}" '
                       'stroke-linecap="round" stroke-linejoin="round"/>')
    return "".join(out)


# ---------------------------------------------------------------- the two shapes
def rrect(x0, y0, x1, y1, r):
    return (f"M{n(x0 + r)} {n(y0)}H{n(x1 - r)}A{n(r)} {n(r)} 0 0 1 {n(x1)} {n(y0 + r)}V{n(y1 - r)}"
            f"A{n(r)} {n(r)} 0 0 1 {n(x1 - r)} {n(y1)}H{n(x0 + r)}A{n(r)} {n(r)} 0 0 1 {n(x0)} {n(y1 - r)}V{n(y0 + r)}"
            f"A{n(r)} {n(r)} 0 0 1 {n(x0 + r)} {n(y0)}Z")


def bubble(x0, y0, x1, y1, r, tail):
    """Speech bubble: a rounded body and a tail to the lower left. tail = (top, x_in, x_out, tip_x, tip_y)."""
    t, a, b, tx, ty = tail
    return rrect(x0, y0, x1, y1, r) + f"M{n(a)} {n(t)}H{n(b)}L{n(tx)} {n(ty)}Z"


def handles(x0, y0, x1, y1, t, length, rr):
    """Four selection-corner brackets; rr rounds them."""
    out = []
    for cx, sx in ((x0, 1), (x1, -1)):
        for cy, sy in ((y0, 1), (y1, -1)):
            pts = [(cx, cy), (cx + sx * length, cy), (cx + sx * length, cy + sy * t), (cx + sx * t, cy + sy * t),
                   (cx + sx * t, cy + sy * length), (cx, cy + sy * length)]
            out.append("M" + "L".join(f"{n(x)} {n(y)}" for x, y in pts) + "Z")
    return "".join(out), rr


# Each symbol on a 512 canvas: the green shape, the box the arm fits in, the gap round the arm,
# the cyan corners and the symbol's overall box.
SPEC = {
    "ttr": dict(shape=bubble(76, 82, 436, 372, 80, (342, 116, 186, 86, 427)), arm=(132, 110, 386, 334), gap=10,
                box=(76, 82, 436, 427)),
    "studio": dict(shape=rrect(80, 80, 432, 432, 60), arm=(124, 124, 388, 388), gap=10,
                   corners=handles(60, 60, 452, 452, 12, 56, 3), box=(57, 57, 455, 455)),
}


def symbol(kind, uid, shape=GREEN, arm=INK, corners=CYAN, gap_fill=VOID, spec=None, w=W, holes=True, size=512):
    """Green shape with the arm and its gap cut out, the arm drawn back in, cyan corners.
    gap_fill paints the gap (inside the shape only), so the white arm keeps its dark edge on any
    background. The one colour versions pass None and leave the gap open."""
    sp = spec or SPEC[kind]
    prims, hs = arm_prims(w, holes)
    fit = Fit(prims, *sp["arm"], snap=sp.get("snap"))
    box = f'maskUnits="userSpaceOnUse" x="0" y="0" width="{size}" height="{size}"><rect width="{size}" height="{size}" fill="#fff"/>'
    defs = f'<mask id="{uid}c" {box}{draw(prims, fit, "#000", sp["gap"])}</mask>' if sp["gap"] else ""
    body = f'<path d="{sp["shape"]}" fill="{shape}"' + (f' mask="url(#{uid}c)"/>' if sp["gap"] else "/>")
    if gap_fill and sp["gap"]:
        defs += f'<clipPath id="{uid}s"><path d="{sp["shape"]}"/></clipPath>'
        body += f'<g clip-path="url(#{uid}s)">{draw(prims, fit, gap_fill, sp["gap"])}</g>'
    if hs:
        defs += f'<mask id="{uid}h" {box}{draw(hs, fit, "#000")}</mask>'
        body += f'<g mask="url(#{uid}h)">{draw(prims, fit, arm)}</g>'
    else:
        body += draw(prims, fit, arm)
    if "corners" in sp:
        d, rr = sp["corners"]
        edge = f' stroke="{corners}" stroke-width="{n(2 * rr)}" stroke-linejoin="round"' if rr else ""
        body += f'<path d="{d}" fill="{corners}"{edge}/>'
    return (f"<defs>{defs}</defs>" if defs else "") + body


def svg(w, h, body, label, vb=None):
    vb = vb or f"0 0 {n(w)} {n(h)}"
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{n(w)}" height="{n(h)}" role="img" aria-label="{label}">\n'
            f"{body}\n</svg>\n")


TILE = rrect(0, 0, 512, 512, 120)


def mark(kind, light=False):
    tile = f'<path d="{TILE}" fill="{PAPER if light else VOID}"/>'
    if light:
        tile += f'<path d="{rrect(1, 1, 511, 511, 119)}" fill="none" stroke="{VOID}" stroke-opacity=".1" stroke-width="2"/>'
    return svg(512, 512, tile + symbol(kind, "m", corners=TEAL if light else CYAN), NAMES[kind][2])


def glyph(kind, colour=None):
    """The symbol without its tile. With colour: the one colour version, gap and holes left open."""
    x0, y0, x1, y1 = SPEC[kind]["box"]
    side = max(x1 - x0, y1 - y0) + 16
    vb = f"{n((x0 + x1 - side) / 2)} {n((y0 + y1 - side) / 2)} {n(side)} {n(side)}"
    body = symbol(kind, "g", colour, colour, colour, None) if colour else symbol(kind, "g")
    return svg(512, 512, body, NAMES[kind][2], vb)


def square(kind, maskable=False):
    """Full bleed square: iOS and Android cut the corners themselves. The maskable icon keeps
    the symbol inside the safe circle (40 % of the width in radius)."""
    x0, y0, x1, y1 = SPEC[kind]["box"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    k = 1.0
    if maskable:
        far = max(math.hypot(x - cx, y - cy) for x in (x0, x1) for y in (y0, y1))
        k = min(1.0, 0.4 * 512 / far)
    tf = f"translate({n(256 - cx * k)} {n(256 - cy * k)}) scale({n(k)})"
    return svg(512, 512, f'<rect width="512" height="512" fill="{VOID}"/><g transform="{tf}">{symbol(kind, "q")}</g>', NAMES[kind][2])


# ---------------------------------------------------------------- favicon cuts on their own pixel grid
# Pixel coordinates of the target size with straight edges on whole pixels. Heavier links, and the
# gap painted in the void colour so the arm reads the same on a light or a dark tab. The base's gap
# edges are snapped to whole pixels. No ring holes at 16 px.
SMALL = {
    ("ttr", 32): dict(shape=bubble(0, 1, 32, 25, 7, (21, 4, 12, 1, 31)), arm=(4, 3.5, 28.5, 22), gap=1.3, snap=1.3, w=58, holes=True),
    ("ttr", 16): dict(shape=bubble(0, 0, 16, 13, 4, (11, 2, 7, 0, 16)), arm=(2, 1, 14.5, 12), gap=1, snap=1, w=55, holes=False),
    ("studio", 32): dict(shape=rrect(3, 3, 29, 29, 6), arm=(5, 6, 27, 26.5), gap=1.3, snap=1.3, w=58, holes=True,
                         corners=handles(0, 0, 32, 32, 2, 7, 0)),
    ("studio", 16): dict(shape=rrect(2, 2, 14, 14, 3), arm=(2.8, 3.3, 13.2, 12.8), gap=1, snap=1, w=60, holes=False,
                         corners=handles(0, 0, 16, 16, 1, 4, 0)),
}


def small(kind, px):
    sp = SMALL[(kind, px)]
    body = symbol(kind, f"f{px}", spec=sp, w=sp["w"], holes=sp["holes"], size=px)
    return svg(px, px, body, NAMES[kind][2])


# ---------------------------------------------------------------- wordmark
class Font:
    """Outlines text from a TrueType font, with the font's own pair kerning."""

    def __init__(self, path):
        self.f = TTFont(path)
        self.gs, self.cmap, self.upm = self.f.getGlyphSet(), self.f.getBestCmap(), self.f["head"].unitsPerEm
        self.pairs = {}
        gpos = self.f["GPOS"].table
        kern = {i for fr in gpos.FeatureList.FeatureRecord if fr.FeatureTag == "kern" for i in fr.Feature.LookupListIndex}
        for i in sorted(kern):
            for st in gpos.LookupList.Lookup[i].SubTable:
                st = getattr(st, "ExtSubTable", st)
                if not hasattr(st, "PairSet") and not hasattr(st, "Class1Record"):
                    continue
                cov = st.Coverage.glyphs
                if st.Format == 1:
                    for g1, ps in zip(cov, st.PairSet):
                        for r in ps.PairValueRecord:
                            self.pairs.setdefault((g1, r.SecondGlyph), getattr(r.Value1, "XAdvance", 0) or 0)
                else:
                    c1, c2 = st.ClassDef1.classDefs, st.ClassDef2.classDefs
                    for g1 in cov:
                        row = st.Class1Record[c1.get(g1, 0)].Class2Record
                        for g2 in self.cmap.values():
                            v = row[c2.get(g2, 0)].Value1
                            v = getattr(v, "XAdvance", 0) if v else 0
                            if v:
                                self.pairs.setdefault((g1, g2), v)

    def run(self, text, size, x=0.0, y=0.0):
        """Outline text with its baseline at y. Returns the path and its ink bounds (x0, y0, x1, y1)."""
        k = size / self.upm
        pen, bp, cx, prev = SVGPathPen(self.gs, ntos=n), BoundsPen(self.gs), 0.0, None
        for ch in text:
            g = self.cmap[ord(ch)]
            if prev:
                cx += self.pairs.get((prev, g), 0)
            tf = (k, 0, 0, -k, x + cx * k, y)
            self.gs[g].draw(TransformPen(pen, tf))
            self.gs[g].draw(TransformPen(bp, tf))
            cx += self.gs[g].width
            prev = g
        return pen.getCommands(), bp.bounds


BOLD = Font(HERE / "fonts" / "Sora-700.ttf")
BOOK = Font(HERE / "fonts" / "Sora-500.ttf")


def wordmark(kind, size, x, y, light=False):
    """First word in ink, second in green. Returns the svg and the ink bounds."""
    a, b = NAMES[kind][:2]
    d1, b1 = BOLD.run(a, size, x, y)
    d2, b2 = BOLD.run(b, size, b1[2] + size * 0.30, y)
    c1, c2 = (VOID, FOREST) if light else (INK, GREEN)
    return f'<path d="{d1}" fill="{c1}"/><path d="{d2}" fill="{c2}"/>', (b1[0], min(b1[1], b2[1]), b2[2], max(b1[3], b2[3]))


def placed(kind, uid, x, y, h, light=False):
    """The symbol without its tile, scaled so its box is h tall, top left at (x, y). Returns svg, width."""
    x0, y0, x1, y1 = SPEC[kind]["box"]
    k = h / (y1 - y0)
    g = symbol(kind, uid, corners=TEAL if light else CYAN)
    return f'<g transform="translate({n(x - x0 * k)} {n(y - y0 * k)}) scale({n(k)})">{g}</g>', (x1 - x0) * k


def text_at(kind, size, left, middle, light=False):
    """Wordmark with its ink starting at x = left and centred on y = middle."""
    _, b = wordmark(kind, size, 0, 0)
    return wordmark(kind, size, left - b[0], middle - (b[1] + b[3]) / 2, light)


def lockup(kind, light=False):
    H, pad = 160, 16
    sym, sw = placed(kind, "l", pad, pad, H - 2 * pad, light)
    text, tb = text_at(kind, 88, pad + sw + 36, H / 2, light)
    return svg(round(tb[2] + 24), H, sym + text, NAMES[kind][2])


def banner(kind, light=False):
    wd, h = 1280, 320
    defs = "" if light else (f'<defs><radialGradient id="aura" cx=".16" cy=".5" r=".6"><stop offset="0" stop-color="{GREEN}" stop-opacity=".12"/>'
                             f'<stop offset="1" stop-color="{GREEN}" stop-opacity="0"/></radialGradient></defs>')
    body = defs + f'<rect width="{wd}" height="{h}" rx="24" fill="{PAPER if light else VOID}"/>'
    if not light:
        body += f'<rect width="{wd}" height="{h}" rx="24" fill="url(#aura)"/>'
    sym, sw = placed(kind, "b", 96, 64, 192, light)
    left = 96 + sw + 56
    text, tb = text_at(kind, 92, left, 132, light)
    tag, gb = BOOK.run(NAMES[kind][3], 29, 0, 0)
    tag, _ = BOOK.run(NAMES[kind][3], 29, left - gb[0], 222)
    return svg(wd, h, body + sym + text + f'<path d="{tag}" fill="{"#41584a" if light else MUTED}"/>', NAMES[kind][2])


def social(kind):
    wd, h = 1280, 640
    body = (f'<defs><radialGradient id="aura" cx=".5" cy=".34" r=".55"><stop offset="0" stop-color="{GREEN}" stop-opacity=".14"/>'
            f'<stop offset="1" stop-color="{GREEN}" stop-opacity="0"/></radialGradient></defs>'
            f'<rect width="{wd}" height="{h}" fill="{VOID}"/><rect width="{wd}" height="{h}" fill="url(#aura)"/>')
    x0, y0, x1, y1 = SPEC[kind]["box"]
    sh = 232
    sym, _ = placed(kind, "s", (wd - (x1 - x0) * sh / (y1 - y0)) / 2, 84, sh)
    _, tb = wordmark(kind, 100, 0, 0)
    text, _ = text_at(kind, 100, (wd - (tb[2] - tb[0])) / 2, 420)
    _, gb = BOOK.run(NAMES[kind][3], 32, 0, 0)
    tag, _ = BOOK.run(NAMES[kind][3], 32, (wd - (gb[2] - gb[0])) / 2 - gb[0], 530)
    return svg(wd, h, body + sym + text + f'<path d="{tag}" fill="{MUTED}"/>', NAMES[kind][2])


def family():
    """Both products, one above the other."""
    wd, h = 1280, 640
    body = f'<rect width="{wd}" height="{h}" fill="{VOID}"/>'
    for i, kind in enumerate(("ttr", "studio")):
        y = 64 + i * 288
        sym, sw = placed(kind, f"y{i}", 120, y, 224)
        text, _ = text_at(kind, 112, 120 + sw + 64, y + 112)
        body += sym + text
    return svg(wd, h, body, "Text to Robot and Robot Studio")


def files(kind):
    return {
        "mark.svg": mark(kind), "mark-light.svg": mark(kind, True), "glyph.svg": glyph(kind),
        "mark-mono-black.svg": glyph(kind, "#000"), "mark-mono-white.svg": glyph(kind, "#fff"),
        "favicon-small.svg": small(kind, 16), "favicon-32.svg": small(kind, 32),
        "app-square.svg": square(kind), "app-maskable.svg": square(kind, True),
        "lockup.svg": lockup(kind), "lockup-light.svg": lockup(kind, True),
        "banner.svg": banner(kind), "banner-light.svg": banner(kind, True), "social.svg": social(kind),
        "family.svg": family(),
    }


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    fs = files(PRODUCT)
    for name, text in fs.items():
        (OUT / name).write_text(text)
    print(" ".join(fs))
