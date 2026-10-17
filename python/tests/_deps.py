"""Skip a whole test module when an optional dependency is missing.

Call ``require("mujoco", ...)`` before importing anything that needs the
optional stack. unittest's loader turns the raised SkipTest into a skipped
module instead of an import error, so the suite stays green on a minimal
install and runs fully once the extras (``pip install ./python[cad,geometry]``)
are present.
"""
import importlib.util
import sys
import unittest
from pathlib import Path

# Make the in-tree packages importable without `pip install` so the suite runs
# the same from the repo root or from python/.
_PKG_ROOT = str(Path(__file__).resolve().parents[1])
if _PKG_ROOT not in sys.path:
    sys.path.insert(0, _PKG_ROOT)


def require(*modules: str) -> None:
    missing = [m for m in modules if importlib.util.find_spec(m) is None]
    if missing:
        raise unittest.SkipTest("optional dependency not installed: " + ", ".join(missing))
