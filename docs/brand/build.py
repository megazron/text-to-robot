"""Writes the text to robot logo files. Every coordinate is hand-set on a 256 unit grid.

    python docs/brand/build.py            # rewrite the SVGs in docs/brand
    python docs/brand/export.py           # render the PNGs (needs playwright + chromium)
"""
import sys, pathlib
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).parent
G1, G2, GREEN, INK, PAPER, DEEP = "#9dffc8", "#22e374", "#39ff88", "#040806", "#f4faf6", "#0b7a3f"
J = (146, 128)                      # the joint: where the prompt becomes a machine

def glyph(fill, cursor=None, ox=0, oy=0, s=1.0, ids="a"):
    """Chevron = two links, vertex = pin joint, underscore = live cursor. Background-free."""
    cx, cy = J
    cursor = cursor or fill
    return f'''<g transform="translate({ox} {oy}) scale({s})">
  <mask id="cut{ids}" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><rect width="256" height="256" fill="#fff"/><circle cx="{cx}" cy="{cy}" r="35" fill="#000"/></mask>
  <path d="M74 74 {cx} {cy} 74 182" fill="none" stroke="{fill}" stroke-width="36" stroke-linecap="round" stroke-linejoin="round" mask="url(#cut{ids})"/>
  <path d="M{cx} {cy-27}a27 27 0 1 1 0 54a27 27 0 1 1 0-54zm0 17a10 10 0 1 0 0 20a10 10 0 1 0 0-20z" fill="{fill}" fill-rule="evenodd"/>
  <path d="M170 182h22" stroke="{cursor}" stroke-width="22" stroke-linecap="round"/>
</g>'''

def grad(i="g", a=G1, b=G2, y1=56, y2=200):
    return f'<linearGradient id="{i}" gradientUnits="userSpaceOnUse" x1="0" y1="{y1}" x2="0" y2="{y2}"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>'

TILE = "M128 0C232 0 256 24 256 128S232 256 128 256 0 232 0 128 24 0 128 0Z"
def tile(dark=True, ids="t"):
    if dark:
        return (f'<radialGradient id="bg{ids}" cx=".28" cy=".18" r="1"><stop offset="0" stop-color="#11241a"/><stop offset=".6" stop-color="#050b07"/><stop offset="1" stop-color="#020403"/></radialGradient>'
                f'<radialGradient id="glow{ids}" cx="{J[0]/256}" cy="{J[1]/256}" r=".42"><stop offset="0" stop-color="{GREEN}" stop-opacity=".22"/><stop offset="1" stop-color="{GREEN}" stop-opacity="0"/></radialGradient>',
                f'<path d="{TILE}" fill="url(#bg{ids})"/><path d="{TILE}" fill="url(#glow{ids})"/><path d="{TILE}" fill="none" stroke="#b9ffd6" stroke-opacity=".10" stroke-width="2"/>')
    return ("", f'<path d="{TILE}" fill="{PAPER}"/><path d="{TILE}" fill="none" stroke="#0b2a18" stroke-opacity=".10" stroke-width="2"/>')

def svg(w, h, body, label="text to robot"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-label="{label}">\n{body}\n</svg>\n'

def mark(dark=True):
    d, t = tile(dark)
    fill = "url(#g)" if dark else INK
    cur = GREEN if dark else DEEP
    return svg(256, 256, f"<defs>{grad()}{d}</defs>\n{t}\n{glyph(fill, cur)}")

# ---- wordmark: monoline, round caps, x-height 100, stroke 20 (same weight family as the links)
SW = 18
LET = {   # path (baseline y=0, x-height -100), advance
 "t": ("M30 -132V-34a24 24 0 0 0 24 24h10M10 -90h50", 74),
 "e": ("M10 -50h80a40 40 0 1 0 -11.7 28.3", 100),
 "x": ("M10 -90l70 80M80 -90l-70 80", 90),
 "o": ("M50 -90a40 40 0 1 1 0 80a40 40 0 1 1 0-80z", 100),
 "r": ("M10 -10v-80M10 -50a40 40 0 0 1 40-40h6", 66),
 "b": ("M10 -148v98M50 -90a40 40 0 1 1 0 80a40 40 0 1 1 0-80zM10 -50v40", 100),
}
TRACK, SPACE = 16, 50
def word(text, colors, x=0, y=0, s=1.0):
    parts, cx = [], 0
    for ch in text:
        if ch == " ":
            cx += SPACE; continue
        d, adv = LET[ch]
        parts.append((cx, d, colors(len(parts))))
        cx += adv + TRACK
    width = cx - TRACK
    g = "".join(f'<path transform="translate({px} 0)" d="{d}" stroke="{c}"/>' for px, d, c in parts)
    return f'<g transform="translate({x} {y}) scale({s})" fill="none" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round">{g}</g>', width * s

def colours(ink, accent):
    # "text to robot": the word "to" carries the accent
    return lambda i: accent if i in (4, 5) else ink

def lockup(dark=True):
    h = 256
    d, t = tile(dark)
    fill = "url(#g)" if dark else INK
    w, ww = word("text to robot", colours("#ecfbf1" if dark else INK, GREEN if dark else DEEP), 0, 0, 0.62)
    x0 = 256 + 44
    body = f'<defs>{grad()}{d}</defs>\n{t}\n{glyph(fill, GREEN if dark else DEEP)}\n<g transform="translate({x0} {128+31})">{w}</g>'
    return svg(int(x0 + ww + 8), h, body)

def mono(colour):
    return svg(256, 256, glyph(colour))

def banner():
    W, H = 1280, 320
    d, t = tile(True, "b")
    w, ww = word("text to robot", colours("#ecfbf1", GREEN), 0, 0, 0.6)
    body = (f'<defs>{grad()}{d}<radialGradient id="aura" cx=".14" cy=".5" r=".7"><stop offset="0" stop-color="{GREEN}" stop-opacity=".16"/><stop offset=".5" stop-color="{GREEN}" stop-opacity=".03"/><stop offset="1" stop-color="{GREEN}" stop-opacity="0"/></radialGradient></defs>\n'
            f'<rect width="{W}" height="{H}" rx="28" fill="#030605"/><rect width="{W}" height="{H}" rx="28" fill="url(#aura)"/>\n'
            f'<g transform="translate(88 64) scale(.75)">{t}{glyph("url(#g)", GREEN, ids="b")}</g>\n'
            f'<g transform="translate(332 160)">{w}</g>\n'
            f'<text x="332" y="222" font-family="ui-sans-serif,-apple-system,\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif" font-size="28" fill="#a3b9ab">Describe a robot. Get the parts, the files and the physics.</text>')
    return svg(W, H, body)

def social():
    W, H = 1280, 640
    d, t = tile(True, "s")
    w, ww = word("text to robot", colours("#ecfbf1", GREEN), 0, 0, 0.66)
    body = (f'<defs>{grad()}{d}<radialGradient id="aura" cx=".5" cy=".36" r=".6"><stop offset="0" stop-color="{GREEN}" stop-opacity=".14"/><stop offset="1" stop-color="{GREEN}" stop-opacity="0"/></radialGradient></defs>\n'
            f'<rect width="{W}" height="{H}" fill="#030605"/><rect width="{W}" height="{H}" fill="url(#aura)"/>\n'
            f'<g transform="translate({W/2-100} 112) scale(.78125)">{t}{glyph("url(#g)", GREEN, ids="s")}</g>\n'
            f'<g transform="translate({(W-ww)/2:.1f} 462)">{w}</g>\n'
            f'<text x="{W/2}" y="536" text-anchor="middle" font-family="ui-sans-serif,-apple-system,\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif" font-size="32" fill="#a3b9ab">Describe a robot. Get the parts, the files and the physics.</text>')
    return svg(W, H, body)

def square(maskable=False):
    """Full-bleed square for iOS home screens and Android maskable icons (the OS rounds the corners)."""
    d, _ = tile(True, "q")
    k = 0.8 if maskable else 0.9
    o = 128 * (1 - k)
    return svg(256, 256, f'<defs>{grad()}{d}</defs><rect width="256" height="256" fill="url(#bgq)"/><rect width="256" height="256" fill="url(#glowq)"/>{glyph("url(#g)", GREEN, ox=o, oy=o, s=k, ids="q")}')

def small():
    """16 and 32 px: heavier links, solid joint, no pin hole."""
    d, t = tile(True, "f")
    body = (f'<defs>{grad()}{d}</defs>{t}'
            f'<mask id="cutf" maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256"><rect width="256" height="256" fill="#fff"/><circle cx="150" cy="128" r="40"/></mask>'
            f'<path d="M66 66 150 128 66 190" fill="none" stroke="url(#g)" stroke-width="50" stroke-linecap="round" stroke-linejoin="round" mask="url(#cutf)"/>'
            f'<circle cx="150" cy="128" r="30" fill="url(#g)"/><path d="M174 190h26" stroke="{GREEN}" stroke-width="32" stroke-linecap="round"/>')
    return svg(256, 256, body)

files = {"mark.svg": mark(), "mark-light.svg": mark(False), "lockup.svg": lockup(), "lockup-light.svg": lockup(False),
         "mark-mono-black.svg": mono("#000"), "mark-mono-white.svg": mono("#fff"), "banner.svg": banner(),
         "social.svg": social(), "favicon-small.svg": small(), "app-square.svg": square(), "app-maskable.svg": square(True), "glyph.svg": svg(256, 256, f"<defs>{grad()}</defs>{glyph('url(#g)', GREEN)}")}
OUT.mkdir(parents=True, exist_ok=True)
for n, s in files.items(): (OUT / n).write_text(s)
print(" ".join(files))
