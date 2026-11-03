"""Reusable parametric bodies (PCBs, LiPo packs) built from base helpers."""
from __future__ import annotations

from .base import Hole, box, cyl, rbox, union


def pcb_holes(xy, dia, thread=None):
    """Board mounting holes on the board bottom face (z = 0); the structure is below (axis -Z)."""
    return [Hole((float(x), float(y), 0.0), (0.0, 0.0, -1.0), float(dia), thread) for x, y in xy]


def pcb(L, W, t, holes_xy, hole_d, parts=(), bottom=(), r=1.0):
    """Board in the XY plane, corner at the origin, bottom face z = 0, top z = t.

    ``parts``: (x0, x1, y0, y1, height) blocks standing on the top face;
    ``bottom``: same, hanging below the bottom face.
    """
    board = rbox(0, L, 0, W, 0, t, r)
    for x, y in holes_xy:
        board = board - cyl(hole_d, -1, t + 1, x, y)
    blocks = [box(x0, x1, y0, y1, t - 0.01, t + h) for x0, x1, y0, y1, h in parts]
    blocks += [box(x0, x1, y0, y1, -h, 0.01) for x0, x1, y0, y1, h in bottom]
    return union(board, *blocks)


def pack(L, W, H, lead_len=12.0, lead_d=4.0, r=2.0):
    """Soft-case LiPo: rounded block x 0..L, y +-W/2, z 0..H; power + balance leads leave the -X end."""
    body = rbox(0, L, -W / 2, W / 2, 0, H, r)
    leads = [box(-lead_len, 0.01, y - lead_d / 2, y + lead_d / 2, H / 2 - lead_d / 2, H / 2 + lead_d / 2)
             for y in (-W / 6, W / 6)]
    balance = box(-lead_len * 0.6, 0.01, W / 4, W / 4 + 3.0, H / 2 - 0.8, H / 2 + 0.8)
    return union(body, *leads, balance)
