# CHANGELOG — Earth Time Field

Session history with context a future agent can act on. Newest first.

## 2026-06-11 — Session 5 (terrain detail synthesis)

User feedback: peaks render as spikes / ranges as flat (z=4 is ~10 km/texel,
so a lone seamount is one texel). Two-layer fix:
- **Pipeline stage 1.5** `pipeline/enhance_terrain.py` (in run.sh between
  fetch and GLB): relief-modulated ridged fBm. Noise amplitude ∝ blurred
  |∇h| of the REAL data (capped 650 m), faded near sea level so coastlines
  never drift; lon-seamless lattice. Plains +~4 m, Everest +255 m of ridge
  structure. Idempotent: keeps `elevation_raw_f32.npy`, refuses to stack
  detail-on-detail (`--force` reapplies from raw). Asserts the QA landmarks
  itself before writing.
- **Shader micro relief** (fragment-only, normals): 2-octave value noise at
  ~3-7 km wavelength, amplitude ∝ real heightmap slope, `u_micro` slider in
  surface folder. Geometry/HUD/raycast never see it — pure shading.
- QA additions: `?microtest=<0..1>` deterministic close-up frame; micro
  stage frame-diffs 0 vs 1 (got 1.33, bar 0.5). All other stages re-pass on
  the enhanced data.
- Lesson: global-view frame-diffs dilute close-range shading effects —
  point the deterministic QA camera at the feature's use-case distance
  (dist 1.6 over the Himalaya, not 3.2 global).

## 2026-06-11 — Session 4 (alignment proven, fly mode, fog v4)

### Commits
- fog rework: u_exaggeration wired in (speed/density/contrast), mass-aware
  infall via surfaceDeviation() heightmap sampling in the fog raymarch
- fly mode: OrbitControls⇄FlyControls toggle, clearance-scaled speed,
  terrain clamp (camera can't clip), sub-camera HUD while flying
- alignment fix + `qa/check_alignment.py` (the regression gate)

### Root causes of the desync (the actual bugs)
- **Minimap sampled mirrored latitude**: heightmap texture is flipY'd on
  upload, so v=0 = lat −90. Minimap used `1−(lat/180+0.5)`. The earth shader
  was fine (SphereGeometry uv.y already matches the flipped frame). Any NEW
  shader that maps lat→uv must use `lat/180 + 0.5`.
- **Raycast displacement parallax**: the raycaster only sees the UNDISPLACED
  unit-sphere geometry, but the vertex shader pushes the surface out by up to
  ~3% (relief + field displacement). Near the limb that skews picked lat/lon
  by degrees. Fix: `refineSurfaceHit()` re-intersects analytically against
  the locally displaced radius (4 iterations); `surfaceDisp()` in main.js
  mirrors the vertex-shader displacement — KEEP THEM IN SYNC.

### QA harness (use it, don't screenshot-eyeball)
`/opt/homebrew/bin/python3 qa/check_alignment.py [pipeline|runtime|pixel|fly|fog]`
- pipeline: numpy landmark asserts on elevation_f32.npy
- runtime: `?qa=lat,lon;…` → `window.__probe`/`__raycast` JSON in `#qa-out`
- pixel: `?probe=lat,lon` → shader paints red/blue/white marker by ITS
  sampled elevation; PIL reads center pixel
- fly: `?flytest=1` auto-dives at Everest, asserts min clearance + HUD=camera
- fog: `?fogtest=<exag>` fog-only deterministic frames; diff(1e3 vs 1e6)≈33

### New lessons
- **Don't gate headless QA on reaching frame N**: a `frames===240` one-shot
  DOM write never fired under `--virtual-time-budget` (slow swiftshader
  frames). Write/update the QA div EVERY frame; dump-dom reads last state.
- First headless run after adding a new three/addons import triggers a vite
  "new dependencies optimized" page reload mid-run — results garbage; rerun.
- FIELD_GLSL declares u_sunDir/u_moonDir/u_time etc. — remove duplicate
  uniform declarations when prepending it to a shader (fog hit this).
- Fly-mode polish judged worth a human pass: speed feel, roll axis, and
  low-altitude tessellation (8-bit-ish facets at 512×256 sphere) untested
  by QA.

## 2026-06-10/11 — Sessions 1–3 (bootstrap → HQ → fixes)

### Commits
- `2341a38` fix topology/cursor desync (+0.25 uv shift); fog additive + cyan
- `31a2a45` gravity fog v3: free-fall comet streams (decay-free by fract())
- `81c031a` gravity fog v2: flow-map crossfade (superseded by v3)
- `fa22ccb` HQ upgrade: z=4 16-bit data, fog v1, minimap widget, surface clarity
- `b07d77d` initial: pipeline + math engine + globe POC

### What exists now
- **Pipeline** (`pipeline/`, pure Python, no GDAL): AWS Terrain Tiles
  (terrarium, ETOPO1-derived, free S3) → 4096×2048 equirect grid →
  `heightmap_rg16.png` (R=high/G=low byte, lossless 16-bit in WebGL+canvas)
  + 16/8-bit PNGs + `metadata.json` + 74k-vert GLB with `_ELEVATION`
  attribute (pure-Python glTF writer). `--synthetic` offline fallback.
- **Math engine**: `web/src/timeField.js` ⟷ `FIELD_GLSL` in
  `web/src/shaders.js` (MUST stay in sync). Units ps/s vs sea-level geoid;
  terms: g·h/c², mean-centered (ωRcosφ)²/2c², sun+moon tidal quadrupole.
  Validated: Everest grav +83 ns/day, Mariana −168, pole rot +35.
  `web/src/ephemeris.js`: ~1°-accurate sun/moon, earth-fixed frame
  (+Y north, lon = atan2(x, z)).
- **Lens**: shader globe (hypsometric palette w/ hadal band, gradient relief
  shading, coastline stroke, optional contours, dilation heatmap w/ isochron
  bands), gravity-fog v3 (fixed tendril web + comet pulses falling with
  dr/dt ∝ −1/r², additive blend), starfield, minimap depth-grid widget
  (city dropdown / click-to-focus / span + depth sliders), hover HUD with
  per-term ns/day, ±6-month timeline, per-term GUI toggles.

### Hard-won lessons (do not relearn these)
- **SphereGeometry uv ≠ equirect**: uv.x=0 sits at scene lon −90°, so
  heightmap sampling needs `uv.x + 0.25`. The vertex shader ALSO samples
  elevation — if you change the offset, change BOTH vertex and fragment
  (they share `vUv` now; keep it that way). Calibrate empirically with
  headless screenshots: offset 0 → Americas face camera, +0.25 → Greenwich,
  +0.5 → Asia. Camera default faces geometric lon 0.
- **User still reports desync after this fix** → top-prio bug in PLAN.md
  with a data-only QA recipe (Himalaya-vs-Ganges, Andes-vs-trench probes).
- **Time-growing noise advection always decays** into structureless glow
  (unbounded domain shear). Flow-map crossfades only soften it. The robust
  pattern is fully periodic phase: `fract(k·r³ + t·speed)` → contours move
  at dr/dt ∝ −1/r² (true inverse-square infall) and never degrade. Verified
  via frame-diff of headless shots at t=90s vs t=93s (mean |Δ| ≈ 5.3).
- **Additive-blend point clouds white out**: 16k particles at
  `gl_PointSize ∝ 180/z` filled the screen; ~9/z is sane at camera dist ~3.
- **Headless verification works well**: Chrome `--headless=new --screenshot
  --virtual-time-budget=N` renders WebGL fine (swiftshader) and fast-forwards
  rAF; crop with PIL to inspect. Chrome MCP extension was unavailable all
  session — don't depend on it.
- **Terrarium tiles include bathymetry** at low zoom (that's the whole reason
  for using them over SRTM); z=4 = 256 tiles ≈ 30 s fetch, 8 workers.
- The 8-bit heightmap caused ~70 m elevation quantization in the HUD;
  everything now reads the RG16 PNG (shader decode + one-time Float32
  unpack in `main.js`). Don't reintroduce 8-bit sampling.

### Removed / superseded
- Particle "clock field" (session 1) — removed per user feedback, replaced
  by gravity fog (which is itself flagged for rethink, see PLAN.md #3).
- Fog v1 (advection) and v2 (flow-map) — superseded by v3 comet streams.
