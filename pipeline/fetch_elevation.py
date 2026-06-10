#!/usr/bin/env python3
"""
Stage 1 of the Earth data pipeline: acquire a global elevation grid.

Primary source: AWS Terrain Tiles ("terrarium" encoding), a free public
S3 bucket containing merged ETOPO1/GEBCO/SRTM elevation+bathymetry.
At low zoom levels (z=0..4) the data is dominated by ETOPO1, which is
exactly what we want: land elevation AND ocean trenches.

  height_m = (R * 256 + G + B / 256) - 32768

Tiles are Web Mercator; we reproject to an equirectangular (plate carree)
grid so the web client can sample it with plain lat/lon UVs on a sphere.

Fallback: if the network is unavailable, a synthetic-but-plausible Earth
is generated procedurally (fBm continents + hand-placed real features:
Mariana Trench, Himalayas, Andes, Mid-Atlantic Ridge) so downstream
stages never block.

Output:
  data/elevation_f32.npy        raw float32 meters, (H, W) equirect grid
  data/heightmap_16bit.png      normalized 16-bit grayscale PNG
  data/metadata.json            min/max elevation, grid size, provenance

Usage:
  python3 pipeline/fetch_elevation.py [--zoom 3] [--out data] [--synthetic]
"""

import argparse
import io
import json
import math
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from PIL import Image

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
MERCATOR_MAX_LAT = 85.05112878


def fetch_tile(z, x, y, timeout=20):
    url = TILE_URL.format(z=z, x=x, y=y)
    req = urllib.request.Request(url, headers={"User-Agent": "earth-time-field-pipeline/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        img = Image.open(io.BytesIO(resp.read())).convert("RGB")
    rgb = np.asarray(img, dtype=np.float64)
    return (rgb[..., 0] * 256.0 + rgb[..., 1] + rgb[..., 2] / 256.0) - 32768.0


def fetch_world_mercator(zoom):
    """Stitch all tiles at `zoom` into one mercator elevation grid (meters)."""
    n = 2 ** zoom
    grid = np.zeros((n * 256, n * 256), dtype=np.float32)
    jobs = [(x, y) for y in range(n) for x in range(n)]

    def work(job):
        x, y = job
        grid[y * 256:(y + 1) * 256, x * 256:(x + 1) * 256] = fetch_tile(zoom, x, y)

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(work, jobs))
    return grid


def mercator_to_equirect(merc, out_h, out_w):
    """Resample a web-mercator grid onto an equirectangular lat/lon grid."""
    h, w = merc.shape
    lats = np.linspace(90.0, -90.0, out_h)
    # mercator y for each output latitude (clamped to mercator's valid range)
    lat_c = np.clip(lats, -MERCATOR_MAX_LAT, MERCATOR_MAX_LAT)
    lat_r = np.radians(lat_c)
    merc_y = (1.0 - np.log(np.tan(lat_r) + 1.0 / np.cos(lat_r)) / math.pi) / 2.0
    rows = np.clip((merc_y * h).astype(int), 0, h - 1)
    cols = np.clip((np.linspace(0, 1, out_w, endpoint=False) * w).astype(int), 0, w - 1)
    return merc[np.ix_(rows, cols)]


# ---------------------------------------------------------------- synthetic

def _fbm(h, w, octaves=6, seed=42):
    rng = np.random.default_rng(seed)
    out = np.zeros((h, w))
    amp, total = 1.0, 0.0
    for o in range(octaves):
        gh, gw = 4 * 2 ** o, 8 * 2 ** o
        coarse = rng.standard_normal((gh, gw))
        img = Image.fromarray(coarse.astype(np.float32), mode="F").resize((w, h), Image.BICUBIC)
        out += amp * np.asarray(img)
        total += amp
        amp *= 0.5
    return out / total


def _gauss_feature(lat_grid, lon_grid, lat, lon, amp_m, sigma_deg):
    d2 = (lat_grid - lat) ** 2 + (np.minimum(np.abs(lon_grid - lon), 360 - np.abs(lon_grid - lon))) ** 2
    return amp_m * np.exp(-d2 / (2 * sigma_deg ** 2))


def synthetic_earth(out_h, out_w, seed=42):
    """Procedural fallback with the real marquee features stamped in."""
    lats = np.linspace(90, -90, out_h)
    lons = np.linspace(-180, 180, out_w, endpoint=False)
    lon_g, lat_g = np.meshgrid(lons, lats)

    base = _fbm(out_h, out_w, seed=seed)
    elev = np.where(base > 0.15, base * 4500.0, (base - 0.15) * 5500.0 - 500.0)

    # Real features at real coordinates so the field reads as "Earth"
    elev += _gauss_feature(lat_g, lon_g, 11.35, 142.20, -9000, 4)   # Mariana Trench
    elev += _gauss_feature(lat_g, lon_g, 28.00, 86.90, 7500, 6)     # Himalayas
    elev += _gauss_feature(lat_g, lon_g, -20.0, -68.0, 5000, 5)     # Andes
    elev += _gauss_feature(lat_g, lon_g, -32.65, -70.01, 4000, 3)   # Aconcagua
    # Mid-Atlantic Ridge: a ridge line snaking down the Atlantic
    ridge_lon = -30 + 12 * np.sin(np.radians(lat_g) * 2.0)
    dlon = np.minimum(np.abs(lon_g - ridge_lon), 360 - np.abs(lon_g - ridge_lon))
    atlantic = (lat_g < 60) & (lat_g > -55)
    elev += np.where(atlantic, 2500 * np.exp(-dlon ** 2 / (2 * 2.5 ** 2)), 0)

    return np.clip(elev, -11000, 8849).astype(np.float32)


# ------------------------------------------------------------------- output

def write_outputs(elev, out_dir, source):
    out_dir.mkdir(parents=True, exist_ok=True)
    emin, emax = float(elev.min()), float(elev.max())

    np.save(out_dir / "elevation_f32.npy", elev)

    norm = ((elev - emin) / (emax - emin) * 65535.0).astype(np.uint16)
    Image.fromarray(norm, mode="I;16").save(out_dir / "heightmap_16bit.png")

    # 8-bit copy for easy texture use in WebGL (16-bit PNG support is spotty)
    Image.fromarray((norm / 257).astype(np.uint8), mode="L").save(out_dir / "heightmap_8bit.png")

    # full 16-bit precision packed into an ordinary RGB PNG: R = high byte,
    # G = low byte. WebGL/canvas decode this losslessly everywhere:
    #   meters = min + ((R*256 + G) / 65535) * (max - min)
    rg = np.zeros((*norm.shape, 3), dtype=np.uint8)
    rg[..., 0] = (norm >> 8).astype(np.uint8)
    rg[..., 1] = (norm & 0xFF).astype(np.uint8)
    Image.fromarray(rg, mode="RGB").save(out_dir / "heightmap_rg16.png")

    meta = {
        "source": source,
        "projection": "equirectangular",
        "width": int(elev.shape[1]),
        "height": int(elev.shape[0]),
        "elevation_min_m": emin,
        "elevation_max_m": emax,
        "encoding": "png16: meters = min + (value/65535) * (max - min)",
        "earth_radius_m": 6371000.0,
        "landmarks": {
            "mariana_trench": {"lat": 11.35, "lon": 142.20},
            "everest": {"lat": 27.99, "lon": 86.93},
            "aconcagua": {"lat": -32.65, "lon": -70.01},
            "mid_atlantic_ridge": {"lat": 0.0, "lon": -25.0},
            "dead_sea": {"lat": 31.5, "lon": 35.5}
        }
    }
    (out_dir / "metadata.json").write_text(json.dumps(meta, indent=2))
    print(f"[fetch_elevation] wrote {elev.shape[1]}x{elev.shape[0]} grid "
          f"({emin:.0f}m .. {emax:.0f}m) from {source} -> {out_dir}/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zoom", type=int, default=3, help="terrarium tile zoom (3 -> 2048px mercator)")
    ap.add_argument("--width", type=int, default=2048, help="output equirect width (height = width/2)")
    ap.add_argument("--out", default="data", help="output directory")
    ap.add_argument("--synthetic", action="store_true", help="skip network, generate procedural earth")
    args = ap.parse_args()

    out_h, out_w = args.width // 2, args.width
    out_dir = Path(args.out)

    if not args.synthetic:
        try:
            print(f"[fetch_elevation] fetching {4**args.zoom} terrarium tiles at z={args.zoom} ...")
            merc = fetch_world_mercator(args.zoom)
            elev = mercator_to_equirect(merc, out_h, out_w)
            write_outputs(elev, out_dir, f"aws-terrain-tiles-terrarium-z{args.zoom}")
            return
        except Exception as e:
            print(f"[fetch_elevation] network fetch failed ({e}); falling back to synthetic", file=sys.stderr)

    elev = synthetic_earth(out_h, out_w)
    write_outputs(elev, out_dir, "synthetic-fbm-v1")


if __name__ == "__main__":
    main()
