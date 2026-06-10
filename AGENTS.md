# AGENTS.md — Earth Time Field

Guide for agents (and humans) working in this repo.

## What this is
Interactive 3D visualization of how time runs at different rates across Earth's
surface (gravitational + kinematic + tidal relativistic effects), with controlled
exaggeration. Artistic/educational, not a scientific clock.

## Layout
```
pipeline/   Python data pipeline (real elevation -> heightmap + GLB)
data/       pipeline intermediates (gitignored except metadata)
web/        Vite + Three.js app (plain JS, no TypeScript)
PLAN.md     concrete roadmap + session log — READ THIS FIRST
```

## Toolchain (exact paths matter on this machine)
- Python: `/opt/homebrew/bin/python3` (3.14, has numpy + Pillow; **no GDAL**)
- JS: `bun` at `/Users/me/.bun/bin/bun` — use bun, not npm/node
- Dev server: `cd web && bun run dev` (vite)
- Build check: `cd web && bun run build`

## Commands
```sh
./pipeline/run.sh              # full pipeline: real tiles -> heightmap + GLB + copy to web/public/data
./pipeline/run.sh --synthetic  # offline fallback (procedural Earth, real landmarks stamped in)
cd web && bun run dev          # http://localhost:5173
```

## Verification (no test framework yet)
- `cd web && bun run build` must pass.
- Visual check headless (Chrome MCP often unavailable):
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
   --screenshot=/tmp/check.png --window-size=1280,800 --virtual-time-budget=10000 \
   http://localhost:5179` then view the PNG.
- Physics spot-check: `cd web && bun -e` importing `src/timeField.js` —
  Everest grav term ≈ +83 ns/day, Mariana total ≈ −168 ns/day, pole rot ≈ +35 ns/day.

## Hard rules
- **JS, no TypeScript** in `web/`.
- `web/src/timeField.js` and the `FIELD_GLSL` block in `web/src/shaders.js`
  implement the SAME math. Change one -> change the other. Units: ps/s
  (picoseconds drift per second vs sea-level geoid). HUD displays ns/day (×86.4).
- All visual distortion flows through the `u_exaggeration` uniform (1..1e6).
  Tides are ~4 orders smaller than gravity/rotation terms, hence the separate
  `u_tidalBoost`.
- Frame convention everywhere: earth-fixed, +Y north, lat/lon ->
  `(cosφ sinλ, sinφ, cosφ cosλ)`. The globe never rotates; the sun/moon move.
- Pipeline outputs must stay under ~100k verts / ~5 MB GLB.
- Pipeline must never hard-require the network: keep the `--synthetic` path working.

## Data source
AWS Terrain Tiles (terrarium PNG encoding, public S3, no API key):
`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
`height_m = R*256 + G + B/256 - 32768`. Low zooms are ETOPO1-derived, so they
include ocean bathymetry (that's why we don't use SRTM). Increase `--zoom`
(z=4 -> 256 tiles -> 4096px) for more detail; reprojection to equirectangular
is in `pipeline/fetch_elevation.py`.
