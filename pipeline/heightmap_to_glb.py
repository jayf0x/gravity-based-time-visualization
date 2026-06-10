#!/usr/bin/env python3
"""
Stage 2 of the Earth data pipeline: elevation grid -> displaced-sphere GLB.

Builds a UV sphere whose vertices are radially displaced by real elevation
(with a configurable exaggeration baked in, since real relief is invisible
at planet scale: Everest is 0.14% of Earth's radius). Writes a fully valid
binary glTF 2.0 file with positions, normals, UVs, and a custom per-vertex
attribute _ELEVATION (meters) so shaders downstream can compute the time
field per vertex without re-sampling the heightmap.

Pure Python + numpy; no Blender, no Node, no GDAL.

Usage:
  python3 pipeline/heightmap_to_glb.py [--segments 384] [--exaggeration 30]
"""

import argparse
import json
import struct
from pathlib import Path

import numpy as np

EARTH_RADIUS_M = 6371000.0


def build_sphere(elev, seg_lon, seg_lat, exaggeration, unit_radius=1.0):
    """Lat/lon UV sphere displaced by `elev` (H,W float32 meters)."""
    h, w = elev.shape
    lons = np.linspace(-np.pi, np.pi, seg_lon + 1)          # u: 0..1 west->east
    lats = np.linspace(np.pi / 2, -np.pi / 2, seg_lat + 1)  # v: 0..1 north->south
    lon_g, lat_g = np.meshgrid(lons, lats)

    # sample elevation (nearest; grid is equirectangular)
    rows = np.clip(((np.pi / 2 - lat_g) / np.pi * (h - 1)).astype(int), 0, h - 1)
    cols = np.clip(((lon_g + np.pi) / (2 * np.pi) * (w - 1)).astype(int), 0, w - 1)
    e = elev[rows, cols]

    r = unit_radius * (1.0 + exaggeration * e / EARTH_RADIUS_M)
    cx = np.cos(lat_g) * np.sin(lon_g)
    cy = np.sin(lat_g)
    cz = np.cos(lat_g) * np.cos(lon_g)

    pos = np.stack([r * cx, r * cy, r * cz], axis=-1).astype(np.float32)
    nrm = np.stack([cx, cy, cz], axis=-1).astype(np.float32)  # sphere normals are fine for POC
    u = (lon_g + np.pi) / (2 * np.pi)
    v = (np.pi / 2 - lat_g) / np.pi
    uv = np.stack([u, v], axis=-1).astype(np.float32)

    pos = pos.reshape(-1, 3)
    nrm = nrm.reshape(-1, 3)
    uv = uv.reshape(-1, 2)
    elev_attr = e.reshape(-1, 1).astype(np.float32)

    # indices
    cols_n = seg_lon + 1
    idx = []
    for i in range(seg_lat):
        for j in range(seg_lon):
            a = i * cols_n + j
            b = a + 1
            c = a + cols_n
            d = c + 1
            idx.extend([a, c, b, b, c, d])
    indices = np.array(idx, dtype=np.uint32)
    return pos, nrm, uv, elev_attr, indices


def write_glb(path, pos, nrm, uv, elev_attr, indices, meta):
    def pad(b, n=4, ch=b"\x00"):
        return b + ch * (-len(b) % n)

    buffers = [indices.tobytes(), pos.tobytes(), nrm.tobytes(), uv.tobytes(), elev_attr.tobytes()]
    views, accessors, offset = [], [], 0
    bin_blob = b""
    for i, raw in enumerate(buffers):
        raw = pad(raw)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw),
                      "target": 34963 if i == 0 else 34962})
        offset += len(raw)
        bin_blob += raw

    accessors = [
        {"bufferView": 0, "componentType": 5125, "count": len(indices), "type": "SCALAR"},
        {"bufferView": 1, "componentType": 5126, "count": len(pos), "type": "VEC3",
         "min": pos.min(axis=0).tolist(), "max": pos.max(axis=0).tolist()},
        {"bufferView": 2, "componentType": 5126, "count": len(nrm), "type": "VEC3"},
        {"bufferView": 3, "componentType": 5126, "count": len(uv), "type": "VEC2"},
        {"bufferView": 4, "componentType": 5126, "count": len(elev_attr), "type": "SCALAR"},
    ]

    gltf = {
        "asset": {"version": "2.0", "generator": "earth-time-field pipeline v0.1"},
        "extras": meta,
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": "earth"}],
        "meshes": [{"primitives": [{
            "attributes": {"POSITION": 1, "NORMAL": 2, "TEXCOORD_0": 3, "_ELEVATION": 4},
            "indices": 0, "mode": 4, "material": 0
        }]}],
        "materials": [{"name": "earth-default",
                       "pbrMetallicRoughness": {"baseColorFactor": [0.55, 0.6, 0.65, 1.0],
                                                "metallicFactor": 0.0, "roughnessFactor": 0.9}}],
        "bufferViews": views,
        "buffers": [{"byteLength": len(bin_blob)}],
        "accessors": accessors,
    }

    json_blob = pad(json.dumps(gltf, separators=(",", ":")).encode(), ch=b" ")
    total = 12 + 8 + len(json_blob) + 8 + len(bin_blob)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<II", len(json_blob), 0x4E4F534A))  # JSON
        f.write(json_blob)
        f.write(struct.pack("<II", len(bin_blob), 0x004E4942))   # BIN
        f.write(bin_blob)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data", help="dir containing elevation_f32.npy + metadata.json")
    ap.add_argument("--out", default="web/public/data/earth.glb")
    ap.add_argument("--segments", type=int, default=384, help="longitude segments (lat = half)")
    ap.add_argument("--exaggeration", type=float, default=30.0, help="baked relief multiplier")
    args = ap.parse_args()

    data_dir = Path(args.data)
    elev = np.load(data_dir / "elevation_f32.npy")
    src_meta = json.loads((data_dir / "metadata.json").read_text())

    seg_lon, seg_lat = args.segments, args.segments // 2
    pos, nrm, uv, elev_attr, indices = build_sphere(elev, seg_lon, seg_lat, args.exaggeration)

    n_verts = len(pos)
    assert n_verts < 200_000, f"vertex budget blown: {n_verts}"

    meta = {
        "source": src_meta.get("source"),
        "baked_relief_exaggeration": args.exaggeration,
        "elevation_attribute": "_ELEVATION (meters, per vertex)",
        "unit_radius": 1.0,
        "earth_radius_m": EARTH_RADIUS_M,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    write_glb(out, pos, nrm, uv, elev_attr, indices, meta)
    size_kb = out.stat().st_size / 1024
    print(f"[heightmap_to_glb] {n_verts} verts, {len(indices)//3} tris -> {out} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
