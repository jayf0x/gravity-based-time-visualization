# PLAN.md — Topology World roadmap

Outstanding work only. History lives in [CHANGELOG.md](CHANGELOG.md).
Read [AGENTS.md](AGENTS.md) first for toolchain paths, conventions, and the
QA workflow. Run `qa/check_alignment.py` after every scene/mapping change —
it gates pipeline, runtime, shader, fly, fog, micro, and the React toolchain.

## VISION (user-stated, 2026-06-11)

A game-like experience into the world — fun, not childish, modern gamified
UI (Brawl-Stars-chunky buttons, a bit of matrix vibes). **The EARTH is the
main feature**; time dilation is one widget/cursor among several. Two play
modes: **flight** (fly through the world) or **orbit** (look at it). The
world itself must look genuinely interesting: real topology dressed with
generated terrain detail, good lighting, eventually clouds and forests.

## STATUS

- Toolchain: React 19 + R3F 9 + drei + postprocessing + jotai +
  framer-motion + tailwind 4 installed and QA-proven (CHANGELOG session 6).
- Migration step 1 DONE: React root owns the DOM; old index.html overlay
  is React components (components/Title, widgets/Hud, widgets/TimeScrubber)
  + styles/index.css (tailwind imported); the vanilla three scene mounts
  via world/WorldCanvas.jsx escape hatch. Fog off by default. UI copy
  rebranded "Topology World".
- Scene itself is still vanilla `src/main.js` — that's migration step 2.

## TOP PRIORITY — finish the React migration

Target structure (mirrors ~/Documents/GitHub/jonatan-verstraete/site):
```
web/src/
  main.jsx App.jsx        React root (done)
  world/                  R3F scene (port of main.js)
    Earth.jsx Fog.jsx Stars.jsx Minimap.jsx
    controls/             OrbitMode / FlightMode
    qaBridge.js           window.__probe/__raycast + ?qa/?probe/?fogtest/
                          ?microtest/?flytest modes MUST survive the port
  screens/ModeSelect/     init panel (see flow below)
  widgets/                footer widgets, registry pattern
  components/             GameButton, Panel, … gamified primitives
  store/ hooks/ config/ styles/
```

### Step 2 — port the scene to R3F (the big one)
- One component per scene object; uniforms/params move to jotai atoms.
- **Bridge rule:** React writes atoms; scene reads via `store.get(atom)`
  inside `useFrame` (no re-render churn). Per-frame outputs (hover data)
  go to one throttled atom or a DOM ref — never React state per frame.
- Port carefully, in this order, QA after each: earth mesh → starfield →
  minimap inset (scissor render) → controls swap (orbit/fly) → fog →
  QA bridge (`qaBridge.js`) → delete main.js.
- Pitfalls from the vanilla code: renderer.autoClear=false + scissored
  minimap pass (use createPortal/useFrame priority in R3F); top-level
  awaits (metadata, heightmap decode) become suspense/loaders; THREE.Clock
  deprecation — use R3F's clock.

### Step 3 — game flow
- **Mode-select screen** on load, centered panel: preset location (name +
  coords, image later) + two chunky matrix-style buttons — RED = flight,
  BLUE = orbit. Mode required, synced to sessionStorage
  (`atomWithStorage`); location optional, defaults to first preset.
- 4 starter locations (coords verified in CITIES): Tokyo 35.68/139.69,
  New York 40.71/-74.01, La Paz -16.49/-68.15, Reykjavík 64.15/-21.94.
- Start camera at the selected place (or good default position per mode).
- **Footer** with info + widgets; bottom-right button reopens the menu
  (change mode/location). Widgets flex/hide on mobile.
- Hover info becomes a **widget**, built scalable: pluggable "cursors"
  (first: time deviation; later: distance, biome, …).
- Settings (lil-gui or custom panel) stays but reframed: earth/topology
  first, time-lens controls in a sub-folder.

### Step 4 — make the world look interesting
- **Lighting:** real DirectionalLight sun + shadow quality pass +
  postprocessing bloom. The earth shader currently does its OWN lighting —
  don't double-light; either keep shader lighting and skip scene lights on
  the globe, or move to scene lighting deliberately.
- **Live terrain generation around real topology** (ultimate goal): the
  runtime twin of pipeline/enhance_terrain.py. Reference algorithm saved
  at `.keep/terrain-example.ts` (fBm + erosion + rivers, parameterized).
  NOT a seeded world: generate detail around the existing elevation data,
  with user-tweakable params (gain/lacunarity/erosion/rivers…) so the user
  can dial in the look and we keep perfecting defaults. Translate depth +
  color into a real-ish looking world.

## Next up

- Quality selector: reloads page with `?q=` param choosing model/texture
  variant (reload by design — avoids WebGL memory leaks).
- Clouds; seeded forests.
- GLB compression (meshopt/Draco via gltf-transform under bun).
- Minimap v2: label overlay, smooth fly/lerp between regions, own
  exaggeration control.
- Compare-two-cities mode; cumulative drift readout; click-to-pin probes;
  Moon + tidal-bulge mode (time-lens features, post-migration).

## Pipeline backlog

- Tile cache (`data/tiles/`) + `--zoom 5`; regional `--bbox` crops →
  per-region GLB (needed for low flight); normal-map baking.
- Swap hand-rolled ephemeris for `astronomy-engine`; J2 oblateness; GRACE
  gravity-anomaly layer; `bun test` pinning validated numbers (Everest
  +83 ns/day grav, Mariana −168 total, pole +35 rot).

## Known issues / debts

- `THREE.Clock` deprecation warning (fix lands with the R3F port).
- z=4 averages peaks down (Everest reads ~6.7 km globally).
- Pillow `mode="I;16"` deprecation in `fetch_elevation.py` (breaks
  Pillow 13, 2026-10).
- Mercator polar caps clamped at ±85°.
- Single large JS chunk (code-split during migration).
- lil-gui still owns settings; replace with game UI eventually.
