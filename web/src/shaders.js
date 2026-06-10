// The Lens layer: GLSL materials that consume the time field.
// The field math here mirrors timeField.js — keep both in sync.

export const FIELD_GLSL = /* glsl */ `
  const float C2      = 8.987551787e16;
  const float G_SURF  = 9.80665;
  const float R_EARTH = 6371000.0;
  const float OMEGA   = 7.2921159e-5;
  const float PS      = 1e12;

  uniform vec3  u_sunDir;     // earth-fixed, unit
  uniform vec3  u_moonDir;
  uniform float u_sunDist;    // meters
  uniform float u_moonDist;
  uniform float u_tidalBoost;

  float tidalTerm(vec3 p, vec3 dir, float gm, float D) {
    float cosPsi = dot(p, dir);
    return (gm / (D * D * D)) * R_EARTH * R_EARTH * (3.0 * cosPsi * cosPsi - 1.0) * 0.5 / C2 * PS;
  }

  // deviation of clock rate in ps/s. p = unit sphere position, elev in meters.
  float timeRateDeviation(vec3 p, float elev) {
    float grav = (G_SURF * elev / C2) * PS;

    float cosLat = length(p.xz);
    float v = OMEGA * R_EARTH * cosLat;
    float rotMean = pow(OMEGA * R_EARTH, 2.0) / 3.0 / (2.0 * C2) * PS;
    float rot = -(v * v) / (2.0 * C2) * PS + rotMean;

    float tidal = tidalTerm(p, u_sunDir, 1.32712440018e20, u_sunDist)
                + tidalTerm(p, u_moonDir, 4.9048695e12, u_moonDist);

    return grav + rot + tidal * u_tidalBoost;
  }
`;

export const earthVertex = /* glsl */ `
  ${FIELD_GLSL}
  uniform sampler2D u_heightmap;
  uniform float u_elevMin, u_elevMax;
  uniform float u_exaggeration;   // 1 .. 1e6
  uniform float u_displaceAmount; // 0..1, how much the field bulges the surface
  uniform float u_time;

  varying vec3 vSphere;
  varying vec2 vUv;
  varying float vElev;
  varying float vDeviation;

  float sampleElev(vec2 uv) {
    return mix(u_elevMin, u_elevMax, texture2D(u_heightmap, uv).r);
  }

  void main() {
    vUv = uv;
    vSphere = normalize(position);
    vElev = sampleElev(uv);
    vDeviation = timeRateDeviation(vSphere, vElev);

    // baked terrain relief (subtle, fixed) + field-driven breathing displacement
    float relief = 0.012 * (vElev / 8000.0);
    // map exaggeration log-ish: at 1x invisible, at 1e6 dramatic
    float fieldAmp = u_displaceAmount * (u_exaggeration / 1.0e6) * 0.18;
    float breathe = 1.0 + 0.06 * sin(u_time * 1.4 + vDeviation * 3.0);
    float disp = relief + fieldAmp * vDeviation * breathe;

    vec3 pos = vSphere * (1.0 + disp);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const earthFragment = /* glsl */ `
  ${FIELD_GLSL}
  uniform float u_exaggeration;
  uniform float u_heatmapMix;   // 0 = natural earth, 1 = pure dilation heatmap
  uniform float u_time;

  varying vec3 vSphere;
  varying vec2 vUv;
  varying float vElev;
  varying float vDeviation;

  // hypsometric tint computed from elevation -- no texture assets needed
  vec3 naturalColor(float e) {
    if (e <= 0.0) {
      float t = clamp(-e / 7000.0, 0.0, 1.0);
      return mix(vec3(0.10, 0.30, 0.45), vec3(0.01, 0.04, 0.12), t);
    }
    float t = clamp(e / 5500.0, 0.0, 1.0);
    vec3 low   = vec3(0.13, 0.32, 0.14);
    vec3 mid   = vec3(0.48, 0.42, 0.22);
    vec3 high  = vec3(0.95, 0.95, 0.97);
    return e < 2000.0 ? mix(low, mid, e / 2000.0) : mix(mid, high, (e - 2000.0) / 3500.0);
  }

  // diverging heatmap: deep red (slow) -> dark -> violet (fast)
  vec3 heatColor(float d) {
    // visual gain scales with exaggeration so 1x is ~flat
    float g = clamp(d * 0.8 * (0.02 + u_exaggeration / 1.0e6 * 6.0), -1.0, 1.0);
    vec3 slow = vec3(0.95, 0.12, 0.07);
    vec3 zero = vec3(0.07, 0.06, 0.14);
    vec3 fast = vec3(0.62, 0.38, 1.0);
    vec3 c = g < 0.0 ? mix(zero, slow, -g) : mix(zero, fast, g);
    // isochron contour lines, animated to feel like flowing time
    float bands = abs(fract(d * 2.5 * (0.5 + u_exaggeration / 2.0e5) - u_time * 0.05) - 0.5);
    c += vec3(0.20, 0.16, 0.30) * smoothstep(0.06, 0.0, bands) * abs(g);
    return c;
  }

  void main() {
    float dayLight = clamp(dot(vSphere, u_sunDir), -1.0, 1.0);
    float light = 0.10 + 0.95 * smoothstep(-0.12, 0.35, dayLight);

    vec3 nat = naturalColor(vElev) * light;
    // city-glow tease on the night side of land
    if (vElev > 0.0 && dayLight < -0.05) nat += vec3(0.30, 0.22, 0.08) * 0.25;

    vec3 heat = heatColor(vDeviation);
    vec3 col = mix(nat, heat, u_heatmapMix);

    // atmosphere rim
    vec3 viewDir = normalize(cameraPosition - vSphere);
    float rim = pow(1.0 - clamp(dot(viewDir, vSphere), 0.0, 1.0), 3.0);
    col += vec3(0.25, 0.45, 1.0) * rim * 0.35 * light;

    gl_FragColor = vec4(col, 1.0);
  }
`;

export const particleVertex = /* glsl */ `
  ${FIELD_GLSL}
  attribute float a_elev;
  attribute float a_seed;
  uniform float u_time;
  uniform float u_exaggeration;
  varying float vDeviation;
  varying float vSeed;

  void main() {
    vec3 p = normalize(position);
    vDeviation = timeRateDeviation(p, a_elev);
    vSeed = a_seed;

    // each particle is a clock: it orbits its anchor at a speed set by local time rate.
    float rate = 1.0 + vDeviation * (u_exaggeration / 1.0e6) * 2.0;
    float phase = u_time * rate * 2.0 + a_seed * 6.2831;
    float lift = 0.025 + 0.02 * sin(phase);
    vec3 pos = p * (1.018 + 0.012 * (a_elev / 8000.0) + lift * 0.35);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float size = 1.0 + 0.9 * clamp(abs(vDeviation) * (u_exaggeration / 1.0e6) * 1.5, 0.0, 2.0);
    gl_PointSize = size * (9.0 / -mv.z) * (0.7 + 0.3 * sin(phase));
    gl_Position = projectionMatrix * mv;
  }
`;

export const particleFragment = /* glsl */ `
  uniform float u_exaggeration;
  varying float vDeviation;
  varying float vSeed;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.1, length(d));
    float g = clamp(vDeviation * (0.05 + u_exaggeration / 1.0e6 * 3.0), -1.0, 1.0);
    vec3 slow = vec3(1.0, 0.30, 0.18);
    vec3 zero = vec3(0.45, 0.55, 0.85);
    vec3 fast = vec3(0.65, 0.40, 1.0);
    vec3 c = g < 0.0 ? mix(zero, slow, -g) : mix(zero, fast, g);
    gl_FragColor = vec4(c, a * 0.55);
  }
`;

export const starVertex = /* glsl */ `
  attribute float a_mag;
  varying float vMag;
  void main() {
    vMag = a_mag;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = a_mag * 2.0;
    gl_Position = projectionMatrix * mv;
  }
`;

export const starFragment = /* glsl */ `
  varying float vMag;
  void main() {
    float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(vec3(0.8, 0.85, 1.0), a * vMag * 0.5);
  }
`;
