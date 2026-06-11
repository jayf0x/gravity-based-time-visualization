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
    print(f"[{stage}] {mark} {name}: {value:.4g}{unit} (want {op} {thr})")
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


def stage_react():
    """Toolchain: dev server must transform JSX (react/R3F/jotai/babel chain)."""
    import urllib.request
    try:
        body = urllib.request.urlopen(f"{BASE}/src/qa/smoke.jsx", timeout=10).read().decode()
        ok = "jsx" in body and "import" in body
    except Exception as e:
        ok, body = False, str(e)
    print(f"[react] {'PASS' if ok else 'FAIL'} smoke.jsx transform ({len(body)} bytes)")
    if not ok:
        FAILS.append("react/smoke")


def stage_fly():
    """Fly mode: auto-dive at Everest; clamp must hold, HUD must track camera."""
    dom = run_chrome(f"{BASE}/?flytest=1")
    m = re.search(r'id="qa-out"[^>]*>([^<]+)<', dom)
    if not m:
        print("[fly] FAIL no #qa-out (flytest never reached frame 240)")
        FAILS.append("fly/dom")
        return
    res = json.loads(m.group(1))
    check("fly", "min clearance", res["minClear"], ">", 0.002, unit="r")
    hm = re.search(r"lat (-?[\d.]+)..?\s+lon (-?[\d.]+)", res["hud"])
    if not hm:
        print(f"[fly] FAIL HUD unparsable: {res['hud']!r}")
        FAILS.append("fly/hud")
        return
    check("fly", "HUD lat = cam lat", abs(float(hm.group(1)) - res["camLat"]), "<", 0.1, unit="deg")
    check("fly", "HUD lon = cam lon", abs(float(hm.group(2)) - res["camLon"]), "<", 0.1, unit="deg")


def frame_diff(url_a, url_b):
    from PIL import Image, ImageChops
    shots = []
    for url in (url_a, url_b):
        png = tempfile.mktemp(suffix=".png")
        run_chrome(url, screenshot=png)
        shots.append(Image.open(png).convert("L"))
    return np.asarray(ImageChops.difference(*shots), dtype=float).mean()


def stage_fog():
    """Exaggeration must visibly change the fog: frame-diff two shots."""
    d = frame_diff(f"{BASE}/?fogtest=1000", f"{BASE}/?fogtest=1000000")
    check("fog", "exaggeration frame-diff", d, ">", 1.0, unit="")


def stage_micro():
    """Micro relief slider must visibly change terrain shading."""
    d = frame_diff(f"{BASE}/?microtest=0", f"{BASE}/?microtest=1")
    check("micro", "micro-relief frame-diff", d, ">", 0.5, unit="")


if __name__ == "__main__":
    stages = sys.argv[1:] or ["pipeline", "react", "runtime", "pixel", "fly", "fog", "micro"]
    for s in stages:
        globals()[f"stage_{s}"]()
    print(("ALL PASS" if not FAILS else f"FAILED: {', '.join(FAILS)}"))
    sys.exit(1 if FAILS else 0)
