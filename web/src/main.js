import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { sunDirection, moonDirection } from './ephemeris.js';
import { timeRateDeviation, psPerSecToNsPerDay } from './timeField.js';
import {
  earthVertex, earthFragment,
  particleVertex, particleFragment,
  starVertex, starFragment,
} from './shaders.js';

// ----------------------------------------------------------------- scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 100);
camera.position.set(0, 1.1, 3.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.3;
controls.maxDistance = 12;

// --------------------------------------------------------------- params

const params = {
  exaggeration: 200000,      // 1 .. 1e6
  tidalBoost: 20000,         // tides are ~5e-5 ps/s; boost to make them visible
  heatmapMix: 0.65,
  displaceAmount: 0.5,
  mode: 'heatmap + displacement',
  timeSpeed: 600,            // simulated seconds per real second
  showParticles: true,
};

let simTime = new Date();          // simulated date driving sun/moon
let scrubOffsetMs = 0;             // timeline slider: ±6 months

// ------------------------------------------------------- shared uniforms

const sharedUniforms = {
  u_sunDir: { value: new THREE.Vector3(1, 0, 0) },
  u_moonDir: { value: new THREE.Vector3(0, 0, 1) },
  u_sunDist: { value: 1.496e11 },
  u_moonDist: { value: 3.84e8 },
  u_tidalBoost: { value: params.tidalBoost },
  u_exaggeration: { value: params.exaggeration },
  u_time: { value: 0 },
};

// ----------------------------------------------------------- earth mesh

const metadata = await fetch('/data/metadata.json').then(r => r.json());

const heightTex = await new THREE.TextureLoader().loadAsync('/data/heightmap_8bit.png');
heightTex.colorSpace = THREE.NoColorSpace;
heightTex.wrapS = THREE.RepeatWrapping;

const earthMat = new THREE.ShaderMaterial({
  vertexShader: earthVertex,
  fragmentShader: earthFragment,
  uniforms: {
    ...sharedUniforms,
    u_heightmap: { value: heightTex },
    u_elevMin: { value: metadata.elevation_min_m },
    u_elevMax: { value: metadata.elevation_max_m },
    u_heatmapMix: { value: params.heatmapMix },
    u_displaceAmount: { value: params.displaceAmount },
  },
});

// dense sphere; displacement happens in the vertex shader. The pipeline GLB
// (web/public/data/earth.glb) carries the same data with baked relief +
// per-vertex _ELEVATION for engines that want a static mesh.
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 512, 256), earthMat);
scene.add(earth);

// --------------------------------------------------------- particle field

function makeParticles(count = 16000) {
  const pos = new Float32Array(count * 3);
  const elev = new Float32Array(count);
  const seed = new Float32Array(count);
  // we need elevation per particle: sample the 8-bit heightmap via canvas
  const cnv = document.createElement('canvas');
  cnv.width = heightTex.image.width; cnv.height = heightTex.image.height;
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(heightTex.image, 0, 0);
  const img = ctx.getImageData(0, 0, cnv.width, cnv.height).data;
  const { elevation_min_m: emin, elevation_max_m: emax } = metadata;

  for (let i = 0; i < count; i++) {
    // uniform sphere sampling
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const p = [s * Math.sin(th), u, s * Math.cos(th)];
    pos.set(p, i * 3);
    const lon = Math.atan2(p[0], p[2]), lat = Math.asin(p[1]);
    const px = Math.floor((lon / (2 * Math.PI) + 0.5) * (cnv.width - 1));
    const py = Math.floor((0.5 - lat / Math.PI) * (cnv.height - 1));
    elev[i] = emin + (img[(py * cnv.width + px) * 4] / 255) * (emax - emin);
    seed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('a_elev', new THREE.BufferAttribute(elev, 1));
  g.setAttribute('a_seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: sharedUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  return { points: new THREE.Points(g, m), sampleElev: (lat, lon) => {
    const px = Math.floor((lon / 360 + 0.5) * (cnv.width - 1));
    const py = Math.floor((0.5 - lat / 180) * (cnv.height - 1));
    return emin + (img[(py * cnv.width + px) * 4] / 255) * (emax - emin);
  }};
}

const { points: particles, sampleElev } = makeParticles();
scene.add(particles);

// -------------------------------------------------------------- starfield

function makeStars(count = 4000) {
  const pos = new Float32Array(count * 3);
  const mag = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u), r = 40 + Math.random() * 20;
    pos.set([r * s * Math.sin(th), r * u, r * s * Math.cos(th)], i * 3);
    mag[i] = 0.4 + Math.random() ** 3 * 2.2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('a_mag', new THREE.BufferAttribute(mag, 1));
  const m = new THREE.ShaderMaterial({
    vertexShader: starVertex, fragmentShader: starFragment,
    transparent: true, depthWrite: false,
  });
  return new THREE.Points(g, m);
}
scene.add(makeStars());

// sun marker (small glow sprite in the sun's direction)
const sunGlow = new THREE.Mesh(
  new THREE.SphereGeometry(0.35, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff2cc })
);
scene.add(sunGlow);
const moonMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.07, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0x9aa3b5 })
);
scene.add(moonMarker);

// ---------------------------------------------------------------- GUI

const gui = new GUI({ title: 'Time Field' });
gui.add(params, 'exaggeration', 1, 1e6, 1).name('exaggeration ×').onChange(v => {
  sharedUniforms.u_exaggeration.value = v;
});
gui.add(params, 'tidalBoost', 1, 100000, 1).name('tidal boost ×').onChange(v => {
  sharedUniforms.u_tidalBoost.value = v;
});
gui.add(params, 'heatmapMix', 0, 1).name('heatmap ⇄ natural').onChange(v => {
  earthMat.uniforms.u_heatmapMix.value = v;
});
gui.add(params, 'displaceAmount', 0, 1).name('displacement').onChange(v => {
  earthMat.uniforms.u_displaceAmount.value = v;
});
gui.add(params, 'showParticles').name('particle clocks').onChange(v => particles.visible = v);
gui.add(params, 'timeSpeed', 0, 86400, 1).name('time speed (s/s)');

// ------------------------------------------------------------ timeline

const timeline = document.getElementById('timeline');
const clockEl = document.getElementById('clock');
timeline.addEventListener('input', () => {
  scrubOffsetMs = parseFloat(timeline.value) * 0.5 * 365.25 * 86400000; // ±6 months
});

// ---------------------------------------------------------- hover HUD

const hud = document.getElementById('hud');
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

function updateHud(sun, moon) {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(earth, false)[0];
  if (!hit) { hud.textContent = 'hover the globe…'; return; }
  const p = hit.point.clone().normalize();
  const lat = Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)) * 180 / Math.PI;
  const lon = Math.atan2(p.x, p.z) * 180 / Math.PI;
  const elev = sampleElev(lat, lon);
  const d = timeRateDeviation(lat, elev, [p.x, p.y, p.z], sun, moon, 1);
  const nsDay = psPerSecToNsPerDay(d.total);
  const cls = nsDay >= 0 ? 'fast' : 'slow';
  const sign = nsDay >= 0 ? '+' : '';
  hud.innerHTML =
    `lat ${lat.toFixed(2)}°  lon ${lon.toFixed(2)}°  elev ${elev.toFixed(0)} m\n` +
    `<span class="big ${cls}">${sign}${nsDay.toFixed(3)} ns/day</span> vs sea-level geoid\n` +
    `  gravity   ${d.grav >= 0 ? '+' : ''}${psPerSecToNsPerDay(d.grav).toFixed(3)} ns/day\n` +
    `  rotation  ${d.rot >= 0 ? '+' : ''}${psPerSecToNsPerDay(d.rot).toFixed(3)} ns/day\n` +
    `  tides     ${d.tidal >= 0 ? '+' : ''}${psPerSecToNsPerDay(d.tidal).toFixed(6)} ns/day (real)`;
}

// ---------------------------------------------------------------- loop

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  controls.update();

  simTime = new Date(simTime.getTime() + dt * params.timeSpeed * 1000);
  const displayTime = new Date(simTime.getTime() + scrubOffsetMs);

  const sun = sunDirection(displayTime);
  const moon = moonDirection(displayTime);
  sharedUniforms.u_sunDir.value.fromArray(sun.dir);
  sharedUniforms.u_moonDir.value.fromArray(moon.dir);
  sharedUniforms.u_sunDist.value = sun.distanceM;
  sharedUniforms.u_moonDist.value = moon.distanceM;
  sharedUniforms.u_time.value += dt;

  sunGlow.position.fromArray(sun.dir).multiplyScalar(25);
  moonMarker.position.fromArray(moon.dir).multiplyScalar(8);

  clockEl.textContent = displayTime.toUTCString().replace('GMT', 'UTC');
  updateHud(sun, moon);
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

animate();
