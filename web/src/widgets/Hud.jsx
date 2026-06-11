// Hover-info widget, legacy form: renders the container once; the scene
// (main.js) writes innerHTML per frame. Becomes a jotai-fed component with
// pluggable cursors (e.g. "time deviation") during the R3F port.
export default function Hud() {
  return <div id="hud">hover the globe…</div>;
}
