import { atom } from 'jotai';

// Scene parameters (jotai atoms = the only React ↔ three bridge)
export const exaggerationAtom = atom(200000);
export const tidalBoostAtom = atom(20000);
export const heatmapMixAtom = atom(0.65);
export const displaceAmountAtom = atom(0.5);
export const contoursAtom = atom(0);
export const flyModeAtom = atom(false);
export const microReliefAtom = atom(0.6);
export const gravOnAtom = atom(true);
export const rotOnAtom = atom(true);
export const tidalOnAtom = atom(true);
export const timeSpeedAtom = atom(600); // s/s

// Gravity fog
export const fogOnAtom = atom(false);
export const fogDensityAtom = atom(0.9);
export const flowSpeedAtom = atom(2.2);
export const twistAtom = atom(1.5);

// Minimap widget
export const cityAtom = atom('Global view');
export const regionSpanAtom = atom(30); // degrees
export const wellDepthAtom = atom(0.22);

// Sim state (per-frame)
export const simTimeAtom = atom(new Date());
export const scrubOffsetMsAtom = atom(0);
export const displayTimeAtom = atom(new Date());

// Ephemeris state (per frame, written by scene)
export const sunDirectionAtom = atom({ dir: [1, 0, 0], distanceM: 1.496e11 });
export const moonDirectionAtom = atom({ dir: [0, 0, 1], distanceM: 3.84e8 });

// HUD state (per frame, written by scene)
export const hudDataAtom = atom(null);

// Camera state
export const cameraPositionAtom = atom([0, 1.1, 3.2]);
export const cameraTargetAtom = atom([0, 0, 0]);

// QA state
export const qaCamAtom = atom(false);
export const frozenTimeAtom = atom(null);
export const flyStatsAtom = atom(null);

// Cities data
export const CITIES = {
  'Global view': null,
  'Mariana Trench': [11.35, 142.2, 'hadal'],
  'Mt. Everest': [27.99, 86.93],
  'La Paz (3,640 m)': [-16.49, -68.15],
  'Dead Sea (-430 m)': [31.5, 35.5],
  'Quito (equator)': [-0.18, -78.47],
  'Longyearbyen (78°N)': [78.22, 15.65],
  Tokyo: [35.68, 139.69],
  'New York': [40.71, -74.01],
  'Reykjavík (ridge)': [64.15, -21.94],
};
