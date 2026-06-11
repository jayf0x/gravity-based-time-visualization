import { useEffect } from 'react';

// Escape hatch (migration step 1): mounts the vanilla three.js scene after
// the React overlay exists in the DOM (main.js binds #hud/#clock/#timeline
// by id and appends its own canvas to <body>). The ESM cache guarantees the
// scene boots once even if this component remounts. Replaced by R3F
// components in migration step 2.
export default function WorldCanvas() {
  useEffect(() => {
    import('../main.js');
  }, []);
  return null;
}
