// Compact low-precision sun & moon ephemeris (good to ~1° — plenty for lighting
// and tidal direction). Returns unit direction vectors in the EARTH-FIXED frame
// (the globe never rotates in-scene; the sky rotates around it), plus distances.
//
// Frame convention (matches the shader + sphere UVs):
//   +Y = north pole, lat/lon -> v = (cosφ sinλ, sinφ, cosφ cosλ), λ = east longitude.

const DEG = Math.PI / 180;

function julianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

// Greenwich mean sidereal time, radians
function gmst(jd) {
  const t = (jd - 2451545.0) / 36525.0;
  let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t;
  return (((g % 360) + 360) % 360) * DEG;
}

// Equatorial (RA/dec) -> earth-fixed unit vector
function equatorialToEarthFixed(ra, dec, jd) {
  const lon = ra - gmst(jd); // local hour angle convention -> east longitude of sub-point
  return [Math.cos(dec) * Math.sin(lon), Math.sin(dec), Math.cos(dec) * Math.cos(lon)];
}

export function sunDirection(date) {
  const jd = julianDay(date);
  const n = jd - 2451545.0;
  const L = ((280.46 + 0.9856474 * n) % 360) * DEG; // mean longitude
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG; // mean anomaly
  const lambda = L + (1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG; // ecliptic lon
  const eps = 23.439 * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const distAU = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
  return { dir: equatorialToEarthFixed(ra, dec, jd), distanceM: distAU * 1.495978707e11 };
}

export function moonDirection(date) {
  const jd = julianDay(date);
  const t = (jd - 2451545.0) / 36525.0;
  // Simplified lunar theory (largest terms only)
  const Lp = (218.316 + 481267.8813 * t) * DEG; // mean longitude
  const M = (134.963 + 477198.8676 * t) * DEG; // mean anomaly
  const F = (93.272 + 483202.0175 * t) * DEG; // argument of latitude
  const lambda = Lp + 6.289 * DEG * Math.sin(M);
  const beta = 5.128 * DEG * Math.sin(F);
  const distM = (385001 - 20905 * Math.cos(M)) * 1000;
  const eps = 23.439 * DEG;
  const x = Math.cos(beta) * Math.cos(lambda);
  const y = Math.cos(eps) * Math.cos(beta) * Math.sin(lambda) - Math.sin(eps) * Math.sin(beta);
  const z = Math.sin(eps) * Math.cos(beta) * Math.sin(lambda) + Math.cos(eps) * Math.sin(beta);
  const ra = Math.atan2(y, x);
  const dec = Math.asin(z);
  return { dir: equatorialToEarthFixed(ra, dec, jd), distanceM: distM };
}
