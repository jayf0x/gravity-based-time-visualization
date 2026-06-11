import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  hudDataAtom,
  flyModeAtom,
  sunDirectionAtom,
  moonDirectionAtom,
} from '../store/atoms';
import { timeRateDeviation, psPerSecToNsPerDay } from '../timeField';

export default function HudUpdater() {
  const { camera } = useThree();
  const stateRef = useRef({ metadata: null, elevGrid: null });
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2(-2, -2));
  const setHudData = useSetAtom(hudDataAtom);
  const flyMode = useAtomValue(flyModeAtom);
  const sunDir = useAtomValue(sunDirectionAtom);
  const moonDir = useAtomValue(moonDirectionAtom);

  // Load metadata and elevation grid
  useEffect(() => {
    (async () => {
      const meta = await fetch('/data/metadata.json').then((r) => r.json());

      // Decode elevation grid
      const img = await new THREE.TextureLoader().loadAsync('/data/heightmap_rg16.png');
      const cnv = document.createElement('canvas');
      cnv.width = img.image.width;
      cnv.height = img.image.height;
      const ctx = cnv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img.image, 0, 0);
      const px = ctx.getImageData(0, 0, cnv.width, cnv.height).data;
      const out = new Float32Array(cnv.width * cnv.height);
      const { elevation_min_m: emin, elevation_max_m: emax } = meta;
      for (let i = 0; i < out.length; i++) {
        out[i] = emin + ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * (emax - emin);
      }
      stateRef.current = { metadata: meta, elevGrid: { data: out, w: cnv.width, h: cnv.height } };
    })();
  }, []);

  // Track pointer movement
  useEffect(() => {
    const handlePointerMove = (e) => {
      pointerRef.current.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    };
    addEventListener('pointermove', handlePointerMove);
    return () => removeEventListener('pointermove', handlePointerMove);
  }, []);

  // Update HUD each frame
  useFrame(() => {
    const { metadata, elevGrid } = stateRef.current;
    if (!metadata || !elevGrid) return;

    const sampleElev = (lat, lon) => {
      const x = Math.min(
        elevGrid.w - 1,
        Math.max(0, Math.round(((lon + 180) / 360) * (elevGrid.w - 1)))
      );
      const y = Math.min(
        elevGrid.h - 1,
        Math.max(0, Math.round(((90 - lat) / 180) * (elevGrid.h - 1)))
      );
      return elevGrid.data[y * elevGrid.w + x];
    };

    const ptLatLon = (p) => [
      (Math.asin(THREE.MathUtils.clamp(p.y, -1, 1)) * 180) / Math.PI,
      (Math.atan2(p.x, p.z) * 180) / Math.PI,
    ];

    const refineSurfaceHit = (ray) => {
      let r = 1,
        out = null;
      for (let i = 0; i < 4; i++) {
        const b = ray.origin.dot(ray.direction);
        const c = ray.origin.lengthSq() - r * r;
        const h = b * b - c;
        if (h < 0) return out;
        const p = ray.origin
          .clone()
          .addScaledVector(ray.direction, -b - Math.sqrt(h))
          .normalize();
        const [lat, lon] = ptLatLon(p);
        const elev = sampleElev(lat, lon);
        out = { p, lat, lon, elev };
        r = 1 + elev;
      }
      return out;
    };

    let hit;
    if (flyMode) {
      const p = camera.position.clone().normalize();
      const [lat, lon] = ptLatLon(p);
      hit = { p, lat, lon, elev: sampleElev(lat, lon) };
    } else {
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      hit = refineSurfaceHit(raycasterRef.current.ray);
    }

    if (!hit) {
      setHudData({ text: 'hover the globe… (click to focus minimap)' });
      return;
    }

    const { lat, lon, elev, p } = hit;
    const d = timeRateDeviation(lat, elev, [p.x, p.y, p.z], sunDir.dir, moonDir.dir, 1);
    const nsDay = psPerSecToNsPerDay(d.total);
    const cls = nsDay >= 0 ? 'fast' : 'slow';
    const sign = nsDay >= 0 ? '+' : '';

    setHudData({
      lat: lat.toFixed(2),
      lon: lon.toFixed(2),
      elev: elev.toFixed(0),
      nsDay: nsDay.toFixed(3),
      cls,
      sign,
      grav: psPerSecToNsPerDay(d.grav).toFixed(3),
      rot: psPerSecToNsPerDay(d.rot).toFixed(3),
      tidal: psPerSecToNsPerDay(d.tidal).toFixed(6),
    });
  });

  return null;
}
