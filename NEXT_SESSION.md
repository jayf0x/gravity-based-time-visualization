# Next-session prompt (paste this as the task)

Work through the TOP PRIORITY section of ./PLAN.md, in order, resolving as
much as possible this session. Read ./AGENTS.md and ./CHANGELOG.md first —
they contain the toolchain paths, conventions, and hard-won lessons (don't
relearn the SphereGeometry uv quirk or fog-decay trap from scratch).

Tasks, in order:

1. FIX the map/HUD/cursor alignment bug (PLAN.md top-prio #1) — this blocks
   everything else, do it first and prove it with data, not eyeballs.
2. ADD the FlyControls street-view mode (PLAN.md top-prio #2). Reference:
   .keep/flycontrols.js (API-identical to the bundled r184 addon — import
   from three/addons/controls/FlyControls.js).
3. REWORK the gravity fog into an informative visualization (PLAN.md
   top-prio #3): wire u_exaggeration into it, make flow mass-aware, and
   prototype the streamline/"energy flow" alternative if fog still doesn't
   read. Keep whichever reads better; delete the loser.
4. If time remains: minimap widget v2 items.

## Token-efficiency rules (hard requirements)

- BUILD A QA SCRIPT FIRST, eyeball screenshots LAST. Create
  `qa/check_alignment.py` (use /opt/homebrew/bin/python3) that:
  - loads data/elevation_f32.npy + metadata.json and asserts known geography
    (Himalaya 28.0N/86.9E > 4000 m; Ganges plain 25.0N/83.0E < 200 m;
    Andes -23.0S/-67.5W > 3500 m; Atacama trench -23.0S/-71.5W < -4000 m;
    Mariana 11.35N/142.2E < -8000 m) so the PIPELINE frame is proven first;
  - then drives headless Chrome (path in AGENTS.md) against a debug hook
    you add to web/src/main.js — `window.__probe(lat,lon)` returning
    {elev, deviation} through the SAME code path the HUD uses — via
    --dump-dom or a tiny JSON endpoint rendered into the DOM, and asserts
    the same landmarks. Exit 0/1 with a one-line summary per probe.
  - For shader-side verification, add a `?probe=lat,lon` URL param that
    points the camera straight at that lat/lon and renders a single colored
    marker; the script samples the center pixel with PIL and asserts
    mountain-vs-ocean hue. No human image reading.
- Run the QA script after EVERY shader/mapping change instead of taking
  screenshots to look at. Only view an image manually once, at the very end,
  for the final docs/screenshot.png.
- Don't re-read large files you just wrote; trust Edit results.
- Use `bun run build 2>&1 | grep -E "error|built"` as the cheap syntax gate.
- Batch independent shell checks into single Bash calls.
- The dev server may already be running on :5179 — check with curl before
  starting another.

## Verification bar for "done"

- qa/check_alignment.py passes all probes (pipeline + runtime + pixel).
- bun run build clean.
- Fly mode: toggle works, camera never clips below terrain, HUD reads the
  sub-camera point while flying.
- Fog/energy-flow: changing exaggeration visibly changes it (assert via two
  headless frame-diffs at different exaggeration values in the QA script,
  not by eye).
- Update PLAN.md (remove finished items), append a CHANGELOG.md entry with
  any new lessons, commit with the established message style.
