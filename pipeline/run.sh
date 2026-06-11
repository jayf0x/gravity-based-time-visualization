#!/bin/zsh
# Earth data pipeline: real elevation -> 16-bit heightmap + GLB for the web app.
# Usage: ./pipeline/run.sh [--synthetic]
set -e
cd "$(dirname "$0")/.."
PY=/opt/homebrew/bin/python3

$PY pipeline/fetch_elevation.py --zoom 4 --width 4096 --out data "$@"
$PY pipeline/enhance_terrain.py --data data   # fractal detail synthesis (stage 1.5)
$PY pipeline/heightmap_to_glb.py --data data --out web/public/data/earth.glb --segments 384 --exaggeration 30

# copy artifacts the web client samples directly
cp data/heightmap_16bit.png data/heightmap_8bit.png data/heightmap_rg16.png data/metadata.json web/public/data/
echo "[pipeline] done. artifacts in web/public/data/"
