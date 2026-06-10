# PLAN.md — Earth Time Field roadmap

## Session log

### Session 1 (2026-06-10) — bootstrap, all three layers POC'd ✅
- **Pipeline (Workstream B)**: `pipeline/fetch_elevation.py` pulls real global
  elevation+bathymetry from AWS Terrain Tiles (ETOPO1-derived terrarium tiles,
  no GDAL, no API key), reprojects mercator→equirectangular with numpy, writes
  16-bit + 8-bit heightmaps + `metadata.json`. Offline `--synthetic` fallback
  (fBm + real landmarks). `pipeline/heightmap_to_glb.py` is a pure-Python
  binary glTF 2.0 writer: 74k-vert displaced sphere, custom `_ELEVATION`
  per-vertex attribute, 4.3 MB. Verified real range −10,020 m … +7,796 m.
- **Math engine (Workstream C, the "Clock")**: `web/src/timeField.js` +
  mirrored GLSL. Three physical terms in ps/s vs sea-level geoid:
  gravitational (g·h/c²), kinematic ((ωRcosφ)²/2c², mean-centered), tidal
  quadrupole (sun+moon). `web/src/ephemeris.js`: compact sun/moon ephemeris
  (~1° accuracy) → earth-fixed direction + distance. Validated: Everest grav
  +83 ns/day, Mariana −168 ns/day, pole +35 ns/day, June sun subpoint 23°N. ✓
- **Visualization (Workstream A, the "Lens")**: Vite + Three.js (plain JS).
  Custom ShaderMaterial globe (512×256 sphere, GPU heightmap displacement,
  hypsometric coloring — zero texture assets), dilation heatmap with animated
  isochron bands (violet=fast, red=slow), 16k-particle "clock field" whose
  pulse rate follows local time rate, procedural starfield, day/night
  terminator + atmosphere rim from real sun position, lil-gui (exaggeration
  1→1e6, tidal boost, heatmap⇄natural mix, displacement, time speed),
  ±6-month timeline scrubber, hover HUD with per-term ns/day breakdown.
- Verified end-to-end via headless Chrome screenshots: coastlines, the
  Mid-Atlantic Ridge seam, and the trench-red Pacific all read clearly.

## Next sessions (prioritized)

### 2. Visual fidelity pass
- [ ] Load the pipeline GLB with GLTFLoader as an alternative "static relief"
      mode (currently the GLB is produced + copied but the scene displaces a
      plain sphere from the heightmap — both paths should be switchable).
- [ ] Normals: recompute lighting normals from heightmap gradient in the
      vertex/fragment shader (currently sphere normals → terrain is unlit).
- [ ] EffectComposer: bloom on the violet/fast regions; volumetric glow pass
      from the blueprint (screen-space heat shimmer).
- [ ] Vector/field lines mode: animated dashed lines along ∇(dilation).
- [ ] Night-side city lights from a real texture, atmosphere scattering shader.

### 3. Interaction & education
- [ ] City picker (preset list with lat/lon/elev) + camera fly-to; compare two
      cities: "clock A gains X ns/day on clock B".
- [ ] Cumulative drift mode: integrate dilation over the scrubbed timeline and
      show "if you'd stood here since <date>, you'd be X µs younger/older".
- [ ] Click-to-pin probes with persistent readouts.
- [ ] Moon render + lunar tide visualization toggle (the tidal bulge rotating
      around the globe as the moon orbits is already computed — make it a mode).

### 4. Pipeline scale-up
- [ ] `--zoom 4/5` tiling with on-disk tile cache (`data/tiles/`).
- [ ] Regional high-res crops: `fetch_elevation.py --bbox lat0,lon0,lat1,lon1`
      → per-region GLB for fly-down close-ups (Himalaya, Mariana).
- [ ] Quantize/compress GLB (meshopt or Draco via gltf-transform CLI under bun).
- [ ] Normal-map baking from the 16-bit heightmap (numpy Sobel → PNG).

### 5. Physics depth (Workstream C)
- [ ] Swap hand-rolled ephemeris for `astronomy-engine` (bun add) — keeps API,
      raises accuracy; drive moon distance perigee/apogee tidal amplitude.
- [ ] J2 oblateness term in the geoid reference (currently spherical geoid).
- [ ] GRACE gravity-anomaly layer (placeholder hook exists conceptually: add a
      second texture sampled in `FIELD_GLSL`).
- [ ] Unit tests for timeField.js (bun test) pinning the validated numbers.

## Known issues / debts
- `THREE.Clock` deprecation warning (move to `THREE.Timer`).
- Heightmap sampled at 8-bit in the browser (≈70 m elevation quantization);
  consider decoding the 16-bit PNG via fetch + manual unpack, or a .bin Float32.
- Pillow `mode="I;16"` deprecation in `fetch_elevation.py` (breaks on Pillow 13,
  due 2026-10).
- Poles are clamped (mercator cutoff ±85°); fill polar caps from ETOPO if it
  ever matters visually.
- Single 576 kB JS chunk; fine for now.
