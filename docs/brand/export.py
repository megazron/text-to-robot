"""Render the brand SVGs to PNG with headless Chromium (pip install playwright; playwright install chromium)."""
import pathlib, sys
from playwright.sync_api import sync_playwright
D = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).parent
JOBS = [  # svg, png, css width, css height, device scale
    ("mark.svg", "mark.png", 512, 512, 1), ("mark-light.svg", "mark-light.png", 512, 512, 1),
    ("glyph.svg", "glyph.png", 512, 512, 1),
    ("mark-mono-black.svg", "mark-mono-black.png", 512, 512, 1), ("mark-mono-white.svg", "mark-mono-white.png", 512, 512, 1),
    ("lockup.svg", "lockup.png", None, 128, 2), ("lockup-light.svg", "lockup-light.png", None, 128, 2),
    ("banner.svg", "banner.png", 1280, 320, 2), ("social.svg", "social.png", 1280, 640, 1),
    ("favicon-small.svg", "favicon-16.png", 16, 16, 1), ("mark.svg", "favicon-32.png", 32, 32, 1),
    ("app-square.svg", "apple-touch-icon.png", 180, 180, 1), ("mark.svg", "icon-192.png", 192, 192, 1),
    ("mark.svg", "icon-512.png", 512, 512, 1), ("app-maskable.svg", "icon-maskable-512.png", 512, 512, 1),
]
with sync_playwright() as p:
    b = p.chromium.launch()
    for src, dst, w, h, scale in JOBS:
        svg = (D / src).read_text()
        vb = [float(v) for v in svg.split('viewBox="')[1].split('"')[0].split()]
        w = w or round(h * vb[2] / vb[3])
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=scale)
        style = f'<svg style="display:block;width:{w}px;height:{h}px" '
        pg.set_content('<html><body style="margin:0;background:transparent">' + svg.replace("<svg ", style, 1) + "</body></html>")
        pg.screenshot(path=str(D / dst), omit_background=True)
        pg.close()
        print(dst, w * scale, "x", h * scale)
    b.close()
