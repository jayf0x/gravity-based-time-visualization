// QA bridge: exposes scene state for verification scripts.
// Used by qa/check_alignment.py to validate scene math.

import { getDefaultStore } from 'jotai';
import {
  sunDirectionAtom,
  moonDirectionAtom,
} from '../store/atoms';
import { timeRateDeviation, latLonToVec } from '../timeField';

const store = getDefaultStore();

// Module-scoped state: elevGrid, metadata (shared with HudUpdater)
export let elevGrid = null;
export let metadata = null;

export function initQABridge(meta, grid) {
  metadata = meta;
  elevGrid = grid;
}

// Sample elevation at lat/lon
function sampleElev(lat, lon) {
  if (!elevGrid) return 0;
  const x = Math.min(
    elevGrid.w - 1,
    Math.max(0, Math.round(((lon + 180) / 360) * (elevGrid.w - 1)))
  );
  const y = Math.min(
    elevGrid.h - 1,
    Math.max(0, Math.round(((90 - lat) / 180) * (elevGrid.h - 1)))
  );
  return elevGrid.data[y * elevGrid.w + x];
}

// Export to window for QA scripts
window.__probe = (lat, lon) => {
  const sunDir = store.get(sunDirectionAtom);
  const moonDir = store.get(moonDirectionAtom);
  const elev = sampleElev(lat, lon);
  const d = timeRateDeviation(
    lat,
    elev,
    latLonToVec(lat, lon),
    sunDir.dir,
    moonDir.dir,
    1
  );
  return { elev, deviation: d.total };
};

// Raycast placeholder - full implementation needs R3F context
window.__raycast = (ndcX, ndcY, camera) => {
  if (!camera) return null;
  return null;
};

// Set camera position for QA tests
export function aimCamera(camera, lat, lon, dist = 3.2) {
  const pos = latLonToVec(lat, lon);
  camera.position.set(pos[0] * dist, pos[1] * dist, pos[2] * dist);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
}
