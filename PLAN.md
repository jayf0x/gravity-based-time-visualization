# PLAN.md — Earth Time Field roadmap

Outstanding work only. History lives in [CHANGELOG.md](CHANGELOG.md).
Read [AGENTS.md](AGENTS.md) first for toolchain paths, conventions, and the
headless-Chrome verification workflow.

## TOP PRIORITY — "Topology World" game app (React migration)

User direction (2026-06-11): this becomes a game-like app — fun, modern,
gamified UI (Brawl-Stars-chunky buttons, a bit of matrix vibes, not
childish). The EARTH is the main feature; time dilation becomes one widget/
cursor among several. Two play modes: **flight** or **orbit**.

**Toolchain is PREPPED and verified** (see CHANGELOG session 6): React 19 +
@react-three/fiber 9 + drei + postprocessing + jotai + framer-motion +
lucide-react; vite config with @vitejs/plugin-react (+ @react-three/babel
auto-memoization) + tailwind 4; prettier + eslint flat config; `@` → src
alias; dev port pinned 5179. `qa/check_alignment.py` gained a `react` stage
(JSX transform smoke via src/qa/smoke.jsx). ALL QA STAGES PASS on the new
toolchain — keep it that way at every migration step.

### Target structure (mirrors ~/Documents/GitHub/jonatan-verstraete/site)
```
web/src/
  main.jsx, App.jsx       React root
  world/                  R3F port of today's main.js scene
    Earth.jsx  Fog.jsx  Stars.jsx  Minimap.jsx
    controls/             OrbitMode / FlightMode (port FlyControls logic)
    qaBridge.js           re-expose window.__probe/__raycast + ?qa modes
  screens/ModeSelect/     init panel: location preset + red/blue mode buttons
  widgets/                footer widgets: HoverInfo (lat/lon/elev/time-dev),
                          Minimap, later TimeDeviation cursor — registry
                          pattern like the reference repo's widgets/index
  components/             GameButton, Panel, … (gamified styles)
  store/                  jotai atoms — THE React⇄three bridge
  hooks/  config/  styles/
```

### Architecture decisions (made, follow them)
- **jotai atoms bridge UI⇄scene.** React writes atoms; scene code reads via
  `store.get(atom)` inside `useFrame` (no re-render churn) or subscribes for
  rare changes. Never push per-frame data INTO React state; per-frame HUD
  values go through a single throttled atom or direct DOM ref.
- `modeAtom` ('flight'|'orbit') = atomWithStorage(sessionStorage). Location
  optional, defaults to first preset. Mode screen shows on load when unset.
- 4 starter locations (verified coords, already in CITIES): Tokyo
  35.68/139.69, New York 40.71/-74.01, La Paz -16.49/-68.15, Reykjavík
  64.15/-21.94.
- Fog: DISABLED by default (params.fogOn=false), still toggleable.
- Rebrand "time field" → "topology world" in UI copy/docs; time stays in
  hover widget + future special cursors.
- Quality selector = page reload with `?q=` param choosing model/texture
  variant (deliberate: avoids WebGL memory leaks on hot swap).
- Lighting upgrade: real DirectionalLight sun + shadows + postprocessing
  (bloom) once the scene is R3F; current shader does its own lighting —
  port carefully, don't double-light.
- Live terrain generation: `.keep/terrain-example.ts` (fBm + erosion +
  rivers, seeded) is the reference. Goal is NOT a seeded world but detail
  generated AROUND the real topology data — the live twin of pipeline
  enhance_terrain.py (same relief-modulated principle, user-tweakable
  params). Translate depth+color into a real-ish looking world.

### Migration order (each step ends with full QA pass + build green)
1. index.html → React root; mount current vanilla scene inside a React
   shell unchanged (escape hatch: one component wrapping today's main.js).
2. Port scene to R3F components; keep window.__ QA hooks alive (qaBridge).
3. Mode-select screen + sessionStorage sync + footer/menu UI shell.
4. Widgets: HoverInfo as widget (replaces HUD div), minimap as widget;
   mobile flex/hide.
5. Gamified styling pass (tailwind 4 + framer-motion micro-interactions).
6. Lighting/shadows + bloom; then live terrain detail around topology.

### Later (user-stated future)
- Clouds, seeded forests.
- GLB compression (meshopt/Draco via gltf-transform under bun).
- Quality presets behind the `?q=` reload.

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
