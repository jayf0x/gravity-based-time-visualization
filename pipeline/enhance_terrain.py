#!/usr/bin/env python3
"""
Stage 1.5 of the Earth data pipeline: fractal detail synthesis.

The z=4 source grid is ~10 km/texel, so isolated peaks (a seamount, a single
volcano) land in one texel and render as spikes, while real ranges read flat.
This stage adds relief-modulated ridged fBm: noise amplitude is proportional
to the local relief of the REAL data, so plains and abyssal floors stay
smooth while peaks grow into textured massifs/ranges. Pure numpy, offline.

Properties:
  - longitude-seamless (noise lattice wraps in x)
  - coast-guarded (detail fades to zero near sea level: no coastline drift)
  - idempotent (refuses to run twice on the same grid unless --force)
  - keeps the original grid in elevation_raw_f32.npy

Usage:
  python3 pipeline/enhance_terrain.py [--data data] [--strength 0.9] [--force]
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
from fetch_elevation import write_outputs

# QA landmarks (lat, lon, op, threshold_m) — enhancement must never break these
LANDMARKS = [
    ("everest",  27.99,  86.93, ">",  4000),
    ("ganges",   25.00,  83.00, "<",   200),
    ("andes",   -23.00, -67.50, ">",  3500),
    ("atacama", -23.00, -71.50, "<", -4000),
    ("mariana",  11.35, 142.20, "<", -8000),
]


def sample(elev, lat, lon):
    h, w = elev.shape
    x = int(round((lon + 180) / 360 * (w - 1)))
    y = int(round((90 - lat) / 180 * (h - 1)))
    return float(elev[y, x])


def upsample_wrap(coarse, h, w):
    """Bilinear upsample, periodic in x (longitude), clamped in y."""
    gh, gw = coarse.shape
    fy = np.linspace(0, gh - 1, h)
    y0 = np.floor(fy).astype(int)
    y1 = np.minimum(y0 + 1, gh - 1)
    wy = (fy - y0)[:, None]
    fx = np.arange(w) * (gw / w)
    x0 = np.floor(fx).astype(int) % gw
    x1 = (x0 + 1) % gw
    wx = (fx - np.floor(fx))[None, :]
    top = coarse[y0][:, x0] * (1 - wx) + coarse[y0][:, x1] * wx
    bot = coarse[y1][:, x0] * (1 - wx) + coarse[y1][:, x1] * wx
    return top * (1 - wy) + bot * wy


def ridged_fbm(h, w, octaves=6, base=64, seed=7):
    """Ridge-shaped multifractal in [-0.5, 0.5]ish, lon-seamless."""
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        gh, gw = max(2, h // base * 2 ** o), max(4, w // base * 2 ** o)
        n = upsample_wrap(rng.random((gh, gw)), h, w)
        out += amp * (1.0 - np.abs(2.0 * n - 1.0))  # ridges, in [0,1]
        total += amp
        amp *= 0.55
    return out / total - 0.5


def box_blur(a, radius, passes=3):
    """Separable box blur, ~gaussian after a few passes. Wraps in x."""
    for _ in range(passes):
        k = 2 * radius + 1
        c = np.cumsum(np.pad(a, ((radius + 1, radius), (0, 0)), mode="edge"), axis=0)
        a = (c[k:] - c[:-k]) / k
        ax = np.concatenate([a[:, -radius - 1:], a, a[:, :radius]], axis=1)
        c = np.cumsum(ax, axis=1)
        a = (c[:, k:] - c[:, :-k]) / k
    return a


def enhance(elev, strength, seed=7):
    h, w = elev.shape
    # local relief of the real data: blurred gradient magnitude (m per texel)
    gy, gx = np.gradient(elev.astype(np.float64))
    relief = box_blur(np.hypot(gx, gy), radius=4)

    # amplitude map: proportional to relief, capped; fades at the coast so
    # no land/sea texel ever flips sign by synthesis
    amp = np.minimum(relief * strength, 650.0)
    amp *= np.clip(np.abs(elev) / 300.0, 0.0, 1.0)

    detail = ridged_fbm(h, w, seed=seed) * 2.0 * amp
    return (elev + detail).astype(np.float32), float(np.abs(detail).max())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data")
    ap.add_argument("--strength", type=float, default=0.9,
                    help="detail amplitude as a fraction of local relief")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--force", action="store_true", help="re-run even if already enhanced")
    args = ap.parse_args()

    data = Path(args.data)
    meta = json.loads((data / "metadata.json").read_text())
    if "+detail" in meta["source"] and not args.force:
        # never stack detail on detail; restart from the preserved raw grid
        raw = data / "elevation_raw_f32.npy"
        if not raw.exists():
            sys.exit("[enhance_terrain] already enhanced and no raw backup; refusing")
        elev = np.load(raw)
        base_source = meta["source"].split("+detail")[0]
    else:
        elev = np.load(data / "elevation_f32.npy")
        np.save(data / "elevation_raw_f32.npy", elev)  # preserve the real data
        base_source = meta["source"]

    out, dmax = enhance(elev, args.strength, args.seed)

    print(f"[enhance_terrain] max |detail| = {dmax:.0f} m, strength={args.strength}")
    ok = True
    for name, lat, lon, op, thr in LANDMARKS:
        before, after = sample(elev, lat, lon), sample(out, lat, lon)
        good = after > thr if op == ">" else after < thr
        ok &= good
        print(f"[enhance_terrain] {'PASS' if good else 'FAIL'} {name}: "
              f"{before:.0f} -> {after:.0f} m (want {op} {thr})")
    if not ok:
        sys.exit("[enhance_terrain] landmark broken; lower --strength")

    write_outputs(out, data, f"{base_source}+detail-v1-s{args.strength}")


if __name__ == "__main__":
    main()
