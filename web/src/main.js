import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { sunDirection, moonDirection } from './ephemeris.js';
import { timeRateDeviation, psPerSecToNsPerDay } from './timeField.js';
import {
  earthVertex, earthFragment,
  fogVertex, fogFragment,
  minimapVertex, minimapFragment,
  starVertex, starFragment,
} from './shaders.js';

// ----------------------------------------------------------------- scene

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false; // we manage clears: main view + minimap inset
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

const CITIES = {
  'Global view': null,
  'Mariana Trench': [11.35, 142.20, 'hadal'],
  'Mt. Everest': [27.99, 86.93],
  'La Paz (3,640 m)': [-16.49, -68.15],
  'Dead Sea (-430 m)': [31.5, 35.5],
  'Quito (equator)': [-0.18, -78.47],
  'Longyearbyen (78°N)': [78.22, 15.65],
  'Tokyo': [35.68, 139.69],
  'New York': [40.71, -74.01],
  'Reykjavík (ridge)': [64.15, -21.94],
};

const params = {
  exaggeration: 200000,
  tidalBoost: 20000,
  heatmapMix: 0.65,
  displaceAmount: 0.5,
  contours: 0,            // meters between elevation contours, 0 = off
  gravOn: true, rotOn: true, tidalOn: true,
  timeSpeed: 600,
  // gravity fog
  fogOn: true,
  fogDensity: 0.9,
  flowSpeed: 2.2,
  twist: 1.5,
  // minimap widget
  city: 'Global view',
  regionSpan: 30,         // degrees, square window when a place is selected
  wellDepth: 0.22,
};

let simTime = new Date();
let scrubOffsetMs = 0;

// ------------------------------------------------------- shared uniforms

const sharedUniforms = {
  u_sunDir: { value: new THREE.Vector3(1, 0, 0) },
  u_moonDir: { value: new THREE.Vector3(0, 0, 1) },
  u_sunDist: { value: 1.496e11 },
  u_moonDist: { value: 3.84e8 },
  u_tidalBoost: { value: params.tidalBoost },
  u_gravOn: { value: 1 }, u_rotOn: { value: 1 }, u_tidalOn: { value: 1 },
  u_exaggeration: { value: params.exaggeration },
  u_time: { value: 0 },
};

// ----------------------------------------------------------- earth mesh

const metadata = await fetch('/data/metadata.json').then(r => r.json());

const heightTex = await new THREE.TextureLoader().loadAsync('/data/heightmap_rg16.png');
heightTex.colorSpace = THREE.NoColorSpace;
heightTex.wrapS = THREE.RepeatWrapping;
heightTex.minFilter = THREE.LinearFilter; // no mips: RG bytes must not be averaged across mip levels
heightTex.generateMipmaps = false;

const elevUniforms = {
  u_heightmap: { value: heightTex },
  u_elevMin: { value: metadata.elevation_min_m },
  u_elevMax: { value: metadata.elevation_max_m },
};

const earthMat = new THREE.ShaderMaterial({
  vertexShader: earthVertex,
  fragmentShader: earthFragment,
  uniforms: {
    ...sharedUniforms,
    ...elevUniforms,
    u_heatmapMix: { value: params.heatmapMix },
    u_displaceAmount: { value: params.displaceAmount },
    u_contours: { value: params.contours },
    u_texel: { value: new THREE.Vector2(1 / metadata.width, 1 / metadata.height) },
  },
});

const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 512, 256), earthMat);
scene.add(earth);

// ------------------------------------------------- volumetric gravity fog

const SHELL_OUTER = 2.6;
const fogMat = new THREE.ShaderMaterial({
  vertexShader: fogVertex,
  fragmentShader: fogFragment,
  uniforms: {
    ...sharedUniforms,
    u_fogDensity: { value: params.fogDensity },
    u_flowSpeed: { value: params.flowSpeed },
    u_twist: { value: params.twist },
    u_shellOuter: { value: SHELL_OUTER },
  },
  transparent: true,
  depthWrite: false,
  side: THREE.BackSide, // works from outside and inside the shell
});
const fog = new THREE.Mesh(new THREE.SphereGeometry(SHELL_OUTER, 48, 24), fogMat);
fog.renderOrder = 2;
scene.add(fog);

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
  return new THREE.Points(g, new THREE.ShaderMaterial({
    vertexShader: starVertex, fragmentShader: starFragment,
    transparent: true, depthWrite: false,
  }));
}
scene.add(makeStars());

const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
const moonMarker = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12),
  new THREE.MeshBasicMaterial({ color: 0x9aa3b5 }));
scene.add(sunGlow, moonMarker);

// ---------------------------------------------- 16-bit elevation sampling

// decode the RG16 PNG once into a Float32Array for exact CPU-side reads
const elevGrid = await (async () => {
  const img = heightTex.image;
  const cnv = document.createElement('canvas');
  cnv.width = img.width; cnv.height = img.height;
  const ctx = cnv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, cnv.width, cnv.height).data;
  const out = new Float32Array(cnv.width * cnv.height);
  const { elevation_min_m: emin, elevation_max_m: emax } = metadata;
  for (let i = 0; i < out.length; i++) {
    out[i] = emin + ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * (emax - emin);
  }
  return { data: out, w: cnv.width, h: cnv.height };
})();

function sampleElev(lat, lon) {
  const x = Math.min(elevGrid.w - 1, Math.max(0, Math.round(((lon + 180) / 360) * (elevGrid.w - 1))));
  const y = Math.min(elevGrid.h - 1, Math.max(0, Math.round(((90 - lat) / 180) * (elevGrid.h - 1))));
  return elevGrid.data[y * elevGrid.w + x];
}

// -------------------------------------------------------- minimap widget

const miniScene = new THREE.Scene();
const miniCamera = new THREE.PerspectiveCamera(40, 300 / 210, 0.1, 20);
miniCamera.position.set(0, -1.9, 1.45);
miniCamera.lookAt(0, 0, 0);

const miniMat = new THREE.ShaderMaterial({
  vertexShader: minimapVertex,
  fragmentShader: minimapFragment,
  uniforms: {
    ...sharedUniforms,
    ...elevUniforms,
    u_center: { value: new THREE.Vector2(0, 0) },
    u_spanLat: { value: 180 },
    u_spanLon: { value: 360 },
    u_zScale: { value: params.wellDepth },
  },
  side: THREE.DoubleSide,
  transparent: true,
});
const miniGrid = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6, 128, 96), miniMat);
miniScene.add(miniGrid);

const MINI = { w: 300, h: 210, pad: 14 };

function setRegion(latLon) {
  if (!latLon) {
    miniMat.uniforms.u_center.value.set(0, 0);
    miniMat.uniforms.u_spanLat.value = 180;
    miniMat.uniforms.u_spanLon.value = 360;
    miniGrid.scale.set(1, 0.78, 1);
  } else {
    miniMat.uniforms.u_center.value.set(latLon[0], latLon[1]);
    miniMat.uniforms.u_spanLat.value = params.regionSpan;
    miniMat.uniforms.u_spanLon.value = params.regionSpan;
    miniGrid.scale.set(0.78, 1, 1); // square window
  }
}

// ---------------------------------------------------------------- GUI

const gui = new GUI({ title: 'Time Field' });
gui.add(params, 'exaggeration', 1, 1e6, 1).name('exaggeration ×')
  .onChange(v => sharedUniforms.u_exaggeration.value = v);
gui.add(params, 'timeSpeed', 0, 86400, 1).name('time speed (s/s)');

const fTerms = gui.addFolder('field terms');
fTerms.add(params, 'gravOn').name('gravity (altitude)').onChange(v => sharedUniforms.u_gravOn.value = v ? 1 : 0);
fTerms.add(params, 'rotOn').name('rotation (latitude)').onChange(v => sharedUniforms.u_rotOn.value = v ? 1 : 0);
fTerms.add(params, 'tidalOn').name('tides (sun+moon)').onChange(v => sharedUniforms.u_tidalOn.value = v ? 1 : 0);
fTerms.add(params, 'tidalBoost', 1, 100000, 1).name('tidal boost ×').onChange(v => sharedUniforms.u_tidalBoost.value = v);

const fSurf = gui.addFolder('surface');
fSurf.add(params, 'heatmapMix', 0, 1).name('heatmap ⇄ natural').onChange(v => earthMat.uniforms.u_heatmapMix.value = v);
fSurf.add(params, 'displaceAmount', 0, 1).name('displacement').onChange(v => earthMat.uniforms.u_displaceAmount.value = v);
fSurf.add(params, 'contours', { off: 0, '500 m': 500, '1000 m': 1000, '2000 m': 2000 })
  .name('elev contours').onChange(v => earthMat.uniforms.u_contours.value = v);

const fFog = gui.addFolder('gravity fog');
fFog.add(params, 'fogOn').name('enabled').onChange(v => fog.visible = v);
fFog.add(params, 'fogDensity', 0, 2).name('density').onChange(v => fogMat.uniforms.u_fogDensity.value = v);
fFog.add(params, 'flowSpeed', 0, 8).name('infall speed').onChange(v => fogMat.uniforms.u_flowSpeed.value = v);
fFog.add(params, 'twist', 0, 6).name('twist').onChange(v => fogMat.uniforms.u_twist.value = v);

const fMini = gui.addFolder('minimap widget');
fMini.add(params, 'city', Object.keys(CITIES)).name('place')
  .onChange(name => setRegion(CITIES[name]));
fMini.add(params, 'regionSpan', 2, 90, 1).name('region span (°)')
  .onChange(() => setRegion(CITIES[params.city]));
fMini.add(params, 'wellDepth', 0.02, 0.6).name('well depth')
  .onChange(v => miniMat.uniforms.u_zScale.value = v);

// ------------------------------------------------------------ timeline

const timeline = document.getElementById('timeline');
const clockEl = document.getElementById('clock');
timeline.addEventListener('input', () => {
  scrubOffsetMs = parseFloat(timeline.value) * 0.5 * 365.25 * 86400000;
});

// ---------------------------------------------------------- hover HUD

const hud = document.getElementById('hud');
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

// click the globe -> focus the minimap on that spot
addEventListener('click', (e) => {
  if (e.target !== renderer.domElement) return;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(earth, false)[0];
  if (!hit) return;
  const p = hit.point.clone().normalize();
  const lat = Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)) * 180 / Math.PI;
  const lon = Math.atan2(p.x, p.z) * 180 / Math.PI;
  setRegion([lat, lon]);
  params.city = 'Global view'; // dropdown no longer reflects the pin
});

function updateHud(sun, moon) {
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(earth, false)[0];
  if (!hit) { hud.textContent = 'hover the globe… (click to focus minimap)'; return; }
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

  // main view
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, innerWidth, innerHeight);
  renderer.clear(true, true);
  renderer.render(scene, camera);

  // minimap inset (top-right, under the GUI)
  const x = innerWidth - MINI.w - MINI.pad, y = MINI.pad;
  renderer.setScissorTest(true);
  renderer.setScissor(x, y, MINI.w, MINI.h);
  renderer.setViewport(x, y, MINI.w, MINI.h);
  renderer.clearDepth();
  renderer.render(miniScene, miniCamera);
  renderer.setScissorTest(false);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

setRegion(null);
animate();
