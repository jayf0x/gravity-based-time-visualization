# PLAN.md — Earth Time Field roadmap

Outstanding work only. History lives in [CHANGELOG.md](CHANGELOG.md).
Read [AGENTS.md](AGENTS.md) first for toolchain paths, conventions, and the
headless-Chrome verification workflow.

## TOP PRIORITY (user-reported, next session)

### 1. BUG — mouse / HUD / map still not in sync
Despite the +0.25 uv calibration (commit 2341a38), the user still observes
cursor↔topology mismatch. Don't trust prior reasoning — re-derive end to end.

**Agent QA recipe (no human needed):** the alignment is verifiable from data
alone. Add a debug hook (e.g. `window.__probe(lat, lon)` in `web/src/main.js`
returning `{elev, deviation}` from the same path the HUD uses), then assert
with known geography:
- Himalaya (28.0N, 86.9E) elev ≫ +4000 m vs Ganges plain (25.0N, 83.0E) < 100 m.
- Andes (-23.0S, -67.5W) > +3500 m vs Atacama Trench just west (-23.0S, -71.5W) < −5000 m.
- Also verify the RENDER agrees: screenshot with camera aimed at a probe
  point and check the pixel reads mountain-colored vs ocean-colored.
Check every frame hop separately: heightmap row/col ↔ lat/lon (pipeline),
texture uv ↔ geometry (shader +0.25), raycast point ↔ lat/lon (JS), minimap
window ↔ heightmap uv (`fract(lon/360+0.5)` — note it has NO +0.25; the GLB
pipeline builds its own uvs differently too). Suspect list: lon sign
(atan2(x,z) convention), flipY, the GLB vs heightmap path divergence.

### 2. FEATURE — street-view / fly mode on the surface
Let the user toggle OrbitControls → FlyControls and fly low over the terrain.
- Import from the locally bundled addon: `three/addons/controls/FlyControls.js`
  (r184 API: constructor(camera, domElement); props `movementSpeed`,
  `rollSpeed`, `dragToLook`, `autoForward`; call `controls.update(delta)` each
  frame; dispose on toggle). NOTE: the user mentioned a reference copy at
  `.keep/example.flycontrols.js` but that file is NOT in the repo — use the
  bundled addon, it is current.
- GUI toggle "fly mode"; swap controls cleanly (dispose old, create new),
  keep camera position on switch.
- Scale `movementSpeed` with altitude (slow near surface), clamp camera above
  the displaced terrain radius (sample the 16-bit heightmap at camera lat/lon).
- HUD should keep working in fly mode (probe directly under the camera
  instead of mouse raycast when flying).
- Far-future polish: increase sphere tessellation or regional GLB streaming
  when low (ties into pipeline `--bbox` task below).

### 3. BUG/RETHINK — gravity fog isn't informative
User feedback: (a) `exaggeration` has zero effect on the fog — it's not wired
to any fog uniform; (b) fog "just falls down" uniformly instead of being
attracted to mass — it ignores the time field/terrain entirely; (c) it's only
readable at the limb, invisible against the disk, so you can't see where it
goes; (d) maybe fog is the wrong metaphor — consider "energy flow" instead.
Concrete directions (pick pragmatically, prototype before polishing):
- Wire `u_exaggeration` into fog: amplitude/speed/density of infall should
  scale with it like every other lens does.
- Mass-aware flow: modulate tendril density/brightness by the time-field
  deviation of the surface point below (sample the heightmap with the
  sub-point lat/lon — slow-time basins attract more flow). This makes the
  fog genuinely show the field, not just 1/r².
- Energy-flow alternative (likely better): GPU line/ribbon streamlines —
  precompute ~2k geodesic streamline paths from far field to surface along
  -∇Φ (including terrain perturbation), render as additive ribbons with
  animated dash flow (shader `fract(s - t)`). Reads clearly against both
  space AND the disk, unlike volume fog.
- If keeping fog: add front-of-disk readability (e.g. darken surface behind
  fog slightly, or screen-space composite), plus controls for stream count,
  pulse rate, attraction strength.

## Next up (after top priority)

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
