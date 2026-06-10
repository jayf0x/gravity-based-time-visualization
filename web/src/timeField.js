// The Math Engine ("the Clock"): evaluates the relativistic time-rate deviation
// at a point on Earth's surface. Pure function of (lat, lon, elevation, sun, moon).
// Mirrored 1:1 in GLSL (see shaders.js) — keep both in sync.
//
// Units: picoseconds of clock drift per second (ps/s), relative to a reference
// clock on the rotating geoid at sea level. Positive = time runs FASTER there.
//
//   d_grav  = +g·h / c²                      (altitude: higher = faster)
//   d_rot   = -(ω·R·cosφ)² / 2c² + v̄²/2c²   (spin: equator slower than poles)
//   d_tidal = GM_b/D³ · R²(3cos²ψ-1)/2 / c²  (sun+moon quadrupole potential)
//
// Real magnitudes: Everest ≈ +0.97 ps/s, equator-vs-pole ≈ -1.2 ps/s,
// tides ≈ ±0.00005 ps/s (hence the separate tidal boost control).

export const C2 = 8.987551787e16;      // c² (m²/s²)
export const G_SURF = 9.80665;         // m/s²
export const R_EARTH = 6371000.0;      // m
export const OMEGA = 7.2921159e-5;     // rad/s
export const GM_SUN = 1.32712440018e20;
export const GM_MOON = 4.9048695e12;
const PS = 1e12;

// mean of (ωRcosφ)²/2c² over the sphere = (ωR)²/3 / 2c², used as reference
const ROT_MEAN = (OMEGA * R_EARTH) ** 2 / 3 / (2 * C2) * PS;

export function latLonToVec(latDeg, lonDeg) {
  const la = latDeg * Math.PI / 180, lo = lonDeg * Math.PI / 180;
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
}

/**
 * @param {number} lat       degrees
 * @param {number} elevM     meters above sea level
 * @param {number[]} p       unit position vector (earth-fixed)
 * @param {{dir:number[],distanceM:number}} sun
 * @param {{dir:number[],distanceM:number}} moon
 * @param {number} tidalBoost extra multiplier on tidal term (1 = honest)
 * @returns {{total:number, grav:number, rot:number, tidal:number}} ps/s
 */
export function timeRateDeviation(lat, elevM, p, sun, moon, tidalBoost = 1) {
  const grav = (G_SURF * elevM / C2) * PS;

  const v = OMEGA * R_EARTH * Math.cos(lat * Math.PI / 180);
  const rot = -(v * v) / (2 * C2) * PS + ROT_MEAN;

  const tidal = (tidalTerm(p, sun) + tidalTerm(p, moon)) * tidalBoost;

  return { total: grav + rot + tidal, grav, rot, tidal };
}

function tidalTerm(p, body) {
  const gm = body.distanceM > 1e10 ? GM_SUN : GM_MOON;
  const cosPsi = p[0] * body.dir[0] + p[1] * body.dir[1] + p[2] * body.dir[2];
  const D = body.distanceM;
  return (gm / (D * D * D)) * R_EARTH * R_EARTH * (3 * cosPsi * cosPsi - 1) / 2 / C2 * PS;
}

/** ps/s -> human-friendly nanoseconds per day */
export const psPerSecToNsPerDay = (ps) => ps * 86400 / 1000;
