"""text-to-robot :: MuJoCo layer. Turn a generated URDF into an actuated MuJoCo
model, then test, render and train it. Python because this is where MuJoCo,
Gymnasium and the RL ecosystem live."""
from .convert import urdf_to_mjcf, load_model
from .testbench import run_tests
from .render import render_gif
__all__ = ["urdf_to_mjcf", "load_model", "run_tests", "render_gif"]
