#!/opt/homebrew/bin/python3
"""Alignment QA: pipeline frame -> runtime JS frame -> shader pixel frame.

Usage:
  check_alignment.py            # all stages (needs dev server on :5179)
  check_alignment.py pipeline   # numpy-only stage
Exit 0 = all pass.
"""
import json
import subprocess
import sys
import tempfile
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE = "http://localhost:5179"

# name, lat, lon, op ('>' or '<'), threshold_m
LANDMARKS = [
    ("Himalaya",      28.00,   86.90, ">",  4000),
    ("Ganges plain",  25.00,   83.00, "<",   200),
    ("Andes",        -23.00,  -67.50, ">",  3500),
    ("Atacama trench", -23.00, -71.50, "<", -4000),
    ("Mariana",       11.35,  142.20, "<", -8000),
]

FAILS = []


def check(stage, name, value, op, thr, unit="m"):
    ok = value > thr if op == ">" else value < thr
    mark = "PASS" if ok else "FAIL"
    print(f"[{stage}] {mark} {name}: {value:.0f}{unit} (want {op} {thr})")
    if not ok:
        FAILS.append(f"{stage}/{name}")


def stage_pipeline():
    elev = np.load(ROOT / "data/elevation_f32.npy")
    meta = json.loads((ROOT / "data/metadata.json").read_text())
    h, w = elev.shape
    assert (w, h) == (meta["width"], meta["height"]), "npy/metadata shape mismatch"
    for name, lat, lon, op, thr in LANDMARKS:
        x = int(round((lon + 180) / 360 * (w - 1)))
        y = int(round((90 - lat) / 180 * (h - 1)))
        check("pipeline", name, float(elev[y, x]), op, thr)


def run_chrome(url, screenshot=None, budget=12000):
    args = [CHROME, "--headless=new", f"--window-size=1280,800",
            f"--virtual-time-budget={budget}", "--hide-scrollbars"]
    if screenshot:
        args.append(f"--screenshot={screenshot}")
    else:
        args.append("--dump-dom")
    args.append(url)
    r = subprocess.run(args, capture_output=True, text=not screenshot, timeout=120)
    return r.stdout if not screenshot else None


def stage_runtime():
    qs = ";".join(f"{lat},{lon}" for _, lat, lon, _, _ in LANDMARKS)
    dom = run_chrome(f"{BASE}/?qa={qs}")
    m = re.search(r'id="qa-out"[^>]*>([^<]+)<', dom)
    if not m:
        print("[runtime] FAIL no #qa-out in DOM (server up? hook added?)")
        FAILS.append("runtime/dom")
        return
    results = json.loads(m.group(1))
    for (name, lat, lon, op, thr), res in zip(LANDMARKS, results):
        check("runtime", name, res["elev"], op, thr)
        # raycast round-trip: __raycast(0,0) in probe-camera mode must agree
        if "rayLat" in res:
            dlat = abs(res["rayLat"] - lat)
            dlon = abs((res["rayLon"] - lon + 180) % 360 - 180)
            check("raycast", name, max(dlat, dlon), "<", 0.5, unit="deg")


def stage_pixel():
    from PIL import Image
    # shader marker: red = elev>1000m, blue = elev<-1000m, white = in between
    for name, lat, lon, op, thr in LANDMARKS:
        want = "red" if (op == ">" and thr > 1000) else ("blue" if thr < -1000 else "white")
        png = tempfile.mktemp(suffix=".png")
        run_chrome(f"{BASE}/?probe={lat},{lon}", screenshot=png)
        im = Image.open(png).convert("RGB")
        r, g, b = im.getpixel((im.width // 2, im.height // 2))
        got = ("red" if r > 180 and b < 80 else
               "blue" if b > 180 and r < 80 else
               "white" if min(r, g, b) > 180 else "?")
        ok = got == want
        print(f"[pixel] {'PASS' if ok else 'FAIL'} {name}: rgb({r},{g},{b}) want {want}")
        if not ok:
            FAILS.append(f"pixel/{name}")


def stage_fog():
    """Exaggeration must visibly change the fog: frame-diff two shots."""
    from PIL import Image, ImageChops
    shots = []
    for ex in (1000, 1000000):
        png = tempfile.mktemp(suffix=".png")
        run_chrome(f"{BASE}/?fogtest={ex}", screenshot=png)
        shots.append(Image.open(png).convert("L"))
    diff = np.asarray(ImageChops.difference(*shots), dtype=float)
    check("fog", "exaggeration frame-diff", diff.mean(), ">", 1.0, unit="")


if __name__ == "__main__":
    stages = sys.argv[1:] or ["pipeline", "runtime", "pixel", "fog"]
    for s in stages:
        globals()[f"stage_{s}"]()
    print(("ALL PASS" if not FAILS else f"FAILED: {', '.join(FAILS)}"))
    sys.exit(1 if FAILS else 0)
