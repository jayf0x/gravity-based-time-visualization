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
  uniform float u_gravOn;     // per-term toggles (0/1)
  uniform float u_rotOn;
  uniform float u_tidalOn;

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

    return grav * u_gravOn + rot * u_rotOn + tidal * u_tidalBoost * u_tidalOn;
  }
`;

// lossless 16-bit elevation from RG-packed PNG (R = high byte, G = low byte)
export const ELEV_GLSL = /* glsl */ `
  uniform sampler2D u_heightmap;
  uniform float u_elevMin, u_elevMax;
  float sampleElev(vec2 uv) {
    vec2 rg = texture2D(u_heightmap, uv).rg;
    float n = (rg.r * 255.0 * 256.0 + rg.g * 255.0) / 65535.0;
    return mix(u_elevMin, u_elevMax, n);
  }
`;

// shared diverging heatmap: deep red (slow) <- dark -> violet (fast)
export const HEAT_GLSL = /* glsl */ `
  vec3 heatColor(float d, float exaggeration) {
    float g = clamp(d * 0.8 * (0.02 + exaggeration / 1.0e6 * 6.0), -1.0, 1.0);
    vec3 slow = vec3(0.95, 0.12, 0.07);
    vec3 zero = vec3(0.07, 0.06, 0.14);
    vec3 fast = vec3(0.62, 0.38, 1.0);
    return g < 0.0 ? mix(zero, slow, -g) : mix(zero, fast, g);
  }
`;

export const earthVertex = /* glsl */ `
  ${FIELD_GLSL}
  ${ELEV_GLSL}
  uniform float u_exaggeration;   // 1 .. 1e6
  uniform float u_displaceAmount; // 0..1, how much the field bulges the surface
  uniform float u_time;

  varying vec3 vSphere;
  varying vec2 vUv;
  varying float vElev;
  varying float vDeviation;

  void main() {
    // SphereGeometry's uv.x=0 sits at scene lon -90; the equirect heightmap
    // expects lon -180 there. Shift by +0.25 so texture lon == geometric lon
    // (raycaster/HUD/sun/minimap all use the geometric frame).
    vUv = vec2(uv.x + 0.25, uv.y);
    vSphere = normalize(position);
    vElev = sampleElev(vUv);
    vDeviation = timeRateDeviation(vSphere, vElev);

    // baked terrain relief (subtle, fixed) + field-driven displacement
    float relief = 0.012 * (vElev / 8000.0);
    float fieldAmp = u_displaceAmount * (u_exaggeration / 1.0e6) * 0.18;
    float disp = relief + fieldAmp * vDeviation;

    vec3 pos = vSphere * (1.0 + disp);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const earthFragment = /* glsl */ `
  ${FIELD_GLSL}
  ${ELEV_GLSL}
  ${HEAT_GLSL}
  uniform float u_exaggeration;
  uniform float u_heatmapMix;     // 0 = natural earth, 1 = pure dilation heatmap
  uniform float u_contours;       // 0 = off, else meters between elevation contours
  uniform float u_time;
  uniform vec2  u_texel;          // 1/heightmap size
  uniform vec3  u_probe;          // QA marker: (lat deg, lon deg, enabled)
  uniform float u_micro;          // 0..1 sub-texel shading relief

  varying vec3 vSphere;
  varying vec2 vUv;
  varying float vElev;
  varying float vDeviation;

  // hypsometric palette with hard coastline + banded bathymetry for legibility
  vec3 naturalColor(float e) {
    if (e <= 0.0) {
      float t = clamp(-e / 11000.0, 0.0, 1.0);
      vec3 shelf  = vec3(0.22, 0.55, 0.62);  // 0..-200m
      vec3 upper  = vec3(0.08, 0.32, 0.55);  // -1000m
      vec3 abyss  = vec3(0.03, 0.10, 0.30);  // -5000m
      vec3 trench = vec3(0.30, 0.05, 0.25);  // -11000m: magenta-dark = hadal
      if (e > -200.0)  return mix(shelf, upper, -e / 200.0 * 0.5);
      if (e > -1000.0) return mix(shelf, upper, (-e - 200.0) / 800.0 * 0.5 + 0.5);
      if (e > -6000.0) return mix(upper, abyss, (-e - 1000.0) / 5000.0);
      return mix(abyss, trench, (-e - 6000.0) / 5000.0);
    }
    vec3 coast  = vec3(0.75, 0.78, 0.55);
    vec3 plain  = vec3(0.20, 0.45, 0.18);
    vec3 hills  = vec3(0.55, 0.45, 0.25);
    vec3 mtn    = vec3(0.45, 0.33, 0.28);
    vec3 snow   = vec3(0.96, 0.96, 0.99);
    if (e < 50.0)    return mix(coast, plain, e / 50.0);
    if (e < 800.0)   return mix(plain, hills, (e - 50.0) / 750.0);
    if (e < 3000.0)  return mix(hills, mtn, (e - 800.0) / 2200.0);
    return mix(mtn, snow, clamp((e - 3000.0) / 2500.0, 0.0, 1.0));
  }

  // sub-texel procedural relief: 2-octave value noise, slope-modulated.
  // Pure shading detail (normals only) — geometry and HUD never see it.
  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x),
               mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
  }
  float microH(vec2 uv) {
    return vnoise(uv * 1400.0) * 0.65 + vnoise(uv * 3100.0 + 17.3) * 0.35;
  }

  // terrain-shaded normal from heightmap gradient (clarity > physical truth)
  vec3 terrainNormal() {
    float scale = 60.0; // relief shading strength
    float dx = sampleElev(vUv + vec2(u_texel.x, 0.0)) - sampleElev(vUv - vec2(u_texel.x, 0.0));
    float dy = sampleElev(vUv + vec2(0.0, u_texel.y)) - sampleElev(vUv - vec2(0.0, u_texel.y));

    // micro relief rides on real slope: rugged where the data is rugged
    float m = u_micro * min(length(vec2(dx, dy)), 1200.0);
    if (m > 1.0) {
      float e = 0.7 * u_texel.x;
      dx += (microH(vUv + vec2(e, 0.0)) - microH(vUv - vec2(e, 0.0))) * m;
      dy += (microH(vUv + vec2(0.0, e)) - microH(vUv - vec2(0.0, e))) * m;
    }
    // tangent frame on sphere (east, north)
    vec3 east = normalize(vec3(vSphere.z, 0.0, -vSphere.x));
    vec3 north = cross(vSphere, east);
    return normalize(vSphere - (east * dx + north * -dy) * scale / R_EARTH * 1000.0);
  }

  void main() {
    vec3 n = terrainNormal();
    float dayLight = dot(vSphere, u_sunDir);
    float terr = clamp(dot(n, normalize(u_sunDir + vSphere * 0.6)), 0.0, 1.0);
    float light = 0.18 + 0.55 * smoothstep(-0.12, 0.35, dayLight) + 0.45 * terr;

    vec3 nat = naturalColor(vElev) * light;
    if (vElev > 0.0 && dayLight < -0.05) nat += vec3(0.30, 0.22, 0.08) * 0.25;

    vec3 heat = heatColor(vDeviation, u_exaggeration);
    // keep terrain shading visible through the heatmap so geography stays legible
    heat *= 0.55 + 0.7 * terr;
    // animated isochron contour lines on the dilation field
    float bands = abs(fract(vDeviation * 2.5 * (0.5 + u_exaggeration / 2.0e5) - u_time * 0.05) - 0.5);
    heat += vec3(0.20, 0.16, 0.30) * smoothstep(0.06, 0.0, bands);

    vec3 col = mix(nat, heat, u_heatmapMix);

    // optional elevation contours (meters)
    if (u_contours > 0.0) {
      float c = abs(fract(vElev / u_contours) - 0.5);
      float w = fwidth(vElev / u_contours) * 1.5;
      col = mix(col, vec3(0.0), 0.35 * (1.0 - smoothstep(0.0, w, c)));
    }
    // crisp coastline
    float cw = fwidth(vElev) * 2.0;
    col = mix(col, vec3(0.9, 0.95, 1.0), (1.0 - smoothstep(0.0, cw, abs(vElev))) * 0.5);

    // atmosphere rim
    vec3 viewDir = normalize(cameraPosition - vSphere);
    float rim = pow(1.0 - clamp(dot(viewDir, vSphere), 0.0, 1.0), 3.0);
    col += vec3(0.25, 0.45, 1.0) * rim * 0.35 * (0.4 + 0.6 * light);

    // QA probe marker: paints a dot at (lat,lon) colored by the elevation the
    // SHADER samples there — red mountain / blue ocean / white indeterminate.
    if (u_probe.z > 0.5) {
      float la = radians(u_probe.x), lo = radians(u_probe.y);
      vec3 P = vec3(cos(la) * sin(lo), sin(la), cos(la) * cos(lo));
      if (dot(vSphere, P) > 0.9995) {
        col = vElev > 1000.0 ? vec3(1.0, 0.0, 0.0)
            : (vElev < -1000.0 ? vec3(0.0, 0.0, 1.0) : vec3(1.0));
      }
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// Volumetric gravity fog: raymarched 3D noise advected toward Earth's center.
// "Advection" is faked with zero simulation: the noise domain is shifted
// radially over time with inverse-square speed, so structures stream inward
// and stretch into filaments near the surface. Rendered on the BACK faces of
// an outer shell sphere; rays are clipped against the Earth sphere.

export const fogVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fogFragment = /* glsl */ `
  precision highp float;
  ${FIELD_GLSL}
  ${ELEV_GLSL}
  varying vec3 vWorld;
  uniform float u_time;
  uniform float u_exaggeration; // 1 .. 1e6 — scales infall speed/density/contrast
  uniform float u_fogDensity;   // overall opacity
  uniform float u_flowSpeed;    // inward advection rate
  uniform float u_twist;        // fake angular momentum
  uniform float u_shellOuter;   // outer shell radius

  // time-field deviation (ps/s) of the surface point directly below p
  float surfaceDeviation(vec3 dir) {
    float lat = degrees(asin(clamp(dir.y, -1.0, 1.0)));
    float lon = degrees(atan(dir.x, dir.z));
    // flipY'd equirect: v=0 is lat -90 (same frame as the other shaders)
    vec2 huv = vec2(fract(lon / 360.0 + 0.5), lat / 180.0 + 0.5);
    return timeRateDeviation(dir, sampleElev(huv));
  }

  // iq-style 3D value noise
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i),                  hash(i + vec3(1,0,0)), f.x),
                   mix(hash(i + vec3(0,1,0)),    hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)),    hash(i + vec3(1,0,1)), f.x),
                   mix(hash(i + vec3(0,1,1)),    hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.55;
    for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.13 + 7.7; a *= 0.5; }
    return v;
  }

  // Gravity rendered as infall streams: a FIXED angular web of tendrils
  // (where matter falls) carrying glowing pulses that free-fall inward.
  // Pulse motion comes from fract(k*r^3 + t): contours of constant phase obey
  // dr/dt = -speed/(3k*r^2) -- genuine inverse-square acceleration toward the
  // surface -- and fract() is exactly periodic, so the flow NEVER decays.
  float fogDensity(vec3 p) {
    float r = length(p);
    if (r < 1.01 || r > u_shellOuter) return 0.0;

    // static differential spiral (gravity "drags" the web around the spin axis)
    float ang = u_twist * 0.9 / (r * r) + 0.08 * sin(u_time * 0.07);
    float ca = cos(ang), sa = sin(ang);
    vec3 q = vec3(ca * p.x - sa * p.z, p.y, sa * p.x + ca * p.z);
    vec3 dir = q / r;

    // angular tendril web: fixed filament directions, two noise scales
    float web = fbm(dir * 3.2);
    float fine = fbm(dir * 8.5 + 31.7);
    float tendril = smoothstep(0.42, 0.72, web) * (0.45 + 0.55 * smoothstep(0.35, 0.75, fine));
    if (tendril < 0.01) return 0.0;

    // exaggeration lens: like every other layer, the fog scales with it
    float ex = clamp(u_exaggeration / 1.0e6, 0.0, 1.0);

    // mass-aware attraction: slow-time terrain below (dev < 0) pulls more
    // flow; fast regions starve. Contrast grows with exaggeration.
    float sdev = surfaceDeviation(p / r);
    float mass = clamp(exp(-sdev * (0.6 + 3.4 * ex)), 0.12, 4.0);

    // free-falling comet pulses along each tendril (decorrelated per direction)
    float k = 0.55;
    float speed = u_flowSpeed * (0.25 + 1.75 * ex); // infall rate follows the lens
    float u1 = k * r * r * r + u_time * speed * 0.22 + fine * 2.0;
    float u2 = k * 2.7 * r * r * r + u_time * speed * 0.37 + web * 3.0;
    float comet1 = pow(1.0 - fract(u1), 3.0);          // sharp head, inward tail
    float comet2 = pow(1.0 - fract(u2), 4.0);
    float streamGlow = 0.05 + 0.9 * comet1 + 0.55 * comet2;

    // field strength envelope: bright at the surface but streams stay visible
    // far out; soft fade at the shell edge
    float strength = pow(1.0 / r, 1.6) * smoothstep(u_shellOuter, u_shellOuter * 0.75, r);
    float inner = smoothstep(1.01, 1.06, r);
    // spring-tide pulse: sun/moon alignment breathes the whole field
    float align = abs(dot(u_sunDir, u_moonDir));
    float breathe = 1.0 + 0.25 * align * sin(u_time * 0.6);
    return tendril * streamGlow * strength * inner * breathe * mass * (0.35 + 1.05 * ex);
  }

  vec2 raySphere(vec3 ro, vec3 rd, float rad) { // returns (tNear, tFar), tFar<0 = miss
    float b = dot(ro, rd);
    float c = dot(ro, ro) - rad * rad;
    float h = b * b - c;
    if (h < 0.0) return vec2(1e9, -1e9);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
  }

  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - cameraPosition);

    vec2 shell = raySphere(ro, rd, u_shellOuter);
    float t0 = max(shell.x, 0.0);
    float t1 = shell.y;
    vec2 earth = raySphere(ro, rd, 1.0);
    if (earth.y > 0.0 && earth.x > 0.0) t1 = min(t1, earth.x); // stop at the planet
    if (t1 <= t0) discard;

    const int STEPS = 36;
    float dt = (t1 - t0) / float(STEPS);
    // dither start to hide banding
    float jitter = hash(vec3(gl_FragCoord.xy, u_time)) * dt;

    vec3 acc = vec3(0.0);
    float trans = 1.0;
    for (int i = 0; i < STEPS; i++) {
      vec3 p = ro + rd * (t0 + jitter + dt * (float(i) + 0.5));
      float d = fogDensity(p) * u_fogDensity;
      if (d <= 0.001) continue;
      float r = length(p);
      // emission: faint blue haze far out -> violet -> warm filaments near earth
      float closeness = clamp((u_shellOuter - r) / (u_shellOuter - 1.0), 0.0, 1.0);
      vec3 emit = mix(vec3(0.03, 0.05, 0.13), vec3(0.45, 0.25, 0.85), pow(closeness, 2.0));
      // near-surface streams go hot cyan-white: contrasts against the red/violet
      // surface heatmap instead of melting into it
      emit = mix(emit, vec3(0.60, 0.95, 1.05), pow(closeness, 5.0) * clamp(d * 1.5, 0.0, 1.0));
      float a = 1.0 - exp(-d * dt * 18.0);
      acc += trans * a * emit;
      trans *= 1.0 - a * 0.85;
      if (trans < 0.02) break;
    }
    gl_FragColor = vec4(acc, 1.0 - trans);
  }
`;

// ---------------------------------------------------------------------------
// Minimap widget: a displaced depth-grid of the time field over a lat/lon
// window (global, or a square region around a selected city).

export const minimapVertex = /* glsl */ `
  ${FIELD_GLSL}
  ${ELEV_GLSL}
  uniform vec2  u_center;   // lat, lon (degrees)
  uniform float u_spanLat;  // window height in degrees
  uniform float u_spanLon;  // window width in degrees
  uniform float u_zScale;   // depth-grid amplitude

  varying float vDeviation;
  varying vec2 vGridUv;

  void main() {
    vGridUv = uv;
    float lat = u_center.x + (uv.y - 0.5) * u_spanLat;
    float lon = u_center.y + (uv.x - 0.5) * u_spanLon;
    lat = clamp(lat, -89.9, 89.9);
    float la = radians(lat), lo = radians(lon);
    vec3 p = vec3(cos(la) * sin(lo), sin(la), cos(la) * cos(lo));
    // texture is flipY'd on upload: v=0 is lat -90 (same frame the earth
    // shader uses via SphereGeometry uv.y)
    vec2 huv = vec2(fract(lon / 360.0 + 0.5), lat / 180.0 + 0.5);
    float elev = sampleElev(huv);
    vDeviation = timeRateDeviation(p, elev);

    // gravity-well convention: slower time = deeper pit
    vec3 pos = vec3(position.x, position.y, vDeviation * u_zScale);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const minimapFragment = /* glsl */ `
  ${HEAT_GLSL}
  uniform float u_exaggeration;
  varying float vDeviation;
  varying vec2 vGridUv;

  void main() {
    vec3 col = heatColor(vDeviation, u_exaggeration) * 1.4 + vec3(0.04);
    // grid lines, gravity-well style
    vec2 g = abs(fract(vGridUv * 24.0) - 0.5);
    float line = 1.0 - smoothstep(0.0, 0.08, min(g.x, g.y));
    col = mix(col * 0.55, col * 1.6 + vec3(0.08), line);
    gl_FragColor = vec4(col, 0.95);
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
