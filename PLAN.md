# PLAN.md — Earth Time Field roadmap

Outstanding work only. History lives in [CHANGELOG.md](CHANGELOG.md).
Read [AGENTS.md](AGENTS.md) first for toolchain paths, conventions, and the
headless-Chrome verification workflow.

## TOP PRIORITY

(2026-06-11 session resolved all three: alignment bug fixed — minimap lat
flip + raycast displacement parallax; fly mode shipped; fog wired to
exaggeration + mass-aware. `qa/check_alignment.py` is the regression gate —
run it after any shader/mapping change. Fly mode visual polish still needs a
human pass — see CHANGELOG.)

### Fog follow-up (only if user still finds it unreadable)
Energy-flow streamline alternative: GPU line/ribbon streamlines — precompute
~2k geodesic paths from far field to surface along -∇Φ (incl. terrain
perturbation), additive ribbons with animated dash flow (`fract(s - t)`).
Reads against both space AND the disk. Mass-aware fog v4 shipped first; only
build this if user feedback says fog still doesn't read.

## Next up

### Minimap widget v2
- [ ] Label overlay (place name, min/max ns/day in window, scale legend).
- [ ] Smooth fly/lerp between regions; sync GUI dropdown when clicking globe.
- [ ] Own exaggeration control.

### Visual fidelity
- [ ] GLTFLoader path for the pipeline GLB as a switchable "static relief" mode.
- [ ] EffectComposer: bloom on fast/violet regions; screen-space heat shimmer.
- [ ] Vector/field lines mode along ∇(dilation) (overlaps with fog rethink #3).
- [ ] Night-side city lights texture; atmosphere scattering shader.

### Interaction & education
- [ ] Compare-two-cities mode ("clock A gains X ns/day on B").
- [ ] Cumulative drift: integrate over scrubbed timeline ("X µs younger since <date>").
- [ ] Click-to-pin probes with persistent readouts.
- [ ] Moon render + tidal-bulge visualization mode.

### Pipeline scale-up
- [ ] On-disk tile cache (`data/tiles/`) + `--zoom 5`.
- [ ] Regional crops: `--bbox lat0,lon0,lat1,lon1` → per-region GLB (needed for fly mode).
- [ ] GLB compression (meshopt/Draco via gltf-transform under bun).
- [ ] Normal-map baking (numpy Sobel → PNG) to replace per-fragment gradient.

### Physics depth
- [ ] Swap hand-rolled ephemeris for `astronomy-engine`.
- [ ] J2 oblateness in the geoid reference.
- [ ] GRACE gravity-anomaly texture layer in `FIELD_GLSL`.
- [ ] `bun test` unit tests pinning validated numbers (Everest +83 ns/day grav,
      Mariana −168 ns/day total, pole +35 ns/day rot).

## Known issues / debts
- `THREE.Clock` deprecation warning (move to `THREE.Timer`).
- z=4 averages peaks down (Everest reads ~6.7 km globally).
- Pillow `mode="I;16"` deprecation in `fetch_elevation.py` (breaks Pillow 13, 2026-10).
- Mercator polar caps clamped at ±85°.
- Single ~580 kB JS chunk.
