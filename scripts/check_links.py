#!/usr/bin/env python3
"""Check that every relative link and image in the tracked Markdown files resolves.

Covers [text](path), ![alt](path), [ref]: path, and src="" / href="" in inline HTML.
Links into another Markdown file with a #fragment are checked against its headings.
External links (http, https, mailto) are not fetched.

    python3 scripts/check_links.py
"""
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
INLINE = re.compile(r"!?\[(?:[^\[\]]|\[[^\]]*\])*\]\(\s*<?([^)\s>]+)>?(?:\s+\"[^\"]*\")?\s*\)")
REFDEF = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*<?(\S+?)>?(?:\s+\".*\")?\s*$", re.M)
HTML = re.compile(r"""\b(?:src|href)\s*=\s*["']([^"']+)["']""")
FENCE = re.compile(r"^(```|~~~).*?^\1", re.M | re.S)
CODE = re.compile(r"`[^`\n]*`")
EXTERNAL = ("http://", "https://", "mailto:", "data:", "tel:")


def slug(heading: str) -> str:
    """GitHub's heading anchor: lowercase, markup and punctuation dropped, spaces to hyphens."""
    text = re.sub(r"<[^>]+>", "", heading)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = text.strip().lower().replace("`", "")
    text = re.sub(r"[^\w\- ]", "", text)
    return text.replace(" ", "-")


def anchors(md: Path) -> set[str]:
    seen: dict[str, int] = {}
    out = set()
    body = FENCE.sub("", md.read_text(encoding="utf-8"))
    for m in re.finditer(r"^#{1,6}\s+(.+?)\s*#*\s*$", body, re.M):
        base = slug(m.group(1))
        n = seen.get(base, 0)
        seen[base] = n + 1
        out.add(base if n == 0 else f"{base}-{n}")
    out.update(re.findall(r"""<a\s+(?:name|id)=["']([^"']+)["']""", body))
    return out


def targets(text: str):
    text = CODE.sub("", FENCE.sub("", text))
    for rx in (INLINE, REFDEF, HTML):
        for m in rx.finditer(text):
            yield m.group(1)


def main() -> int:
    files = subprocess.run(["git", "ls-files", "*.md"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.split()
    cache: dict[Path, set[str]] = {}
    bad = []
    for name in files:
        md = ROOT / name
        if not md.exists():
            continue
        for raw in targets(md.read_text(encoding="utf-8")):
            if raw.startswith(EXTERNAL) or raw.startswith("{{"):
                continue
            path, _, frag = raw.partition("#")
            path = unquote(path.split("?")[0])
            dest = md if not path else (ROOT / path.lstrip("/") if path.startswith("/") else md.parent / path)
            if not dest.exists():
                bad.append(f"{name}: {raw} (missing)")
                continue
            if frag and dest.suffix == ".md":
                found = cache.setdefault(dest, anchors(dest))
                if frag.lower() not in found:
                    bad.append(f"{name}: {raw} (no heading #{frag})")
    for line in bad:
        print(line)
    print(f"{len(files)} Markdown files, {len(bad)} broken links")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
