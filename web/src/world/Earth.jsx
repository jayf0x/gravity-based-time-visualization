import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAtomValue } from 'jotai';
import {
  exaggerationAtom,
  tidalBoostAtom,
  heatmapMixAtom,
  displaceAmountAtom,
  contoursAtom,
  microReliefAtom,
  gravOnAtom,
  rotOnAtom,
  tidalOnAtom,
  sunDirectionAtom,
  moonDirectionAtom,
} from '../store/atoms';
import { earthVertex, earthFragment } from '../shaders';

const createEarthUniforms = (meta, tex, params, sunDir, moonDir) => ({
  u_heightmap: { value: tex },
  u_elevMin: { value: meta.elevation_min_m },
  u_elevMax: { value: meta.elevation_max_m },
  u_heatmapMix: { value: params.heatmapMix },
  u_displaceAmount: { value: params.displaceAmount },
  u_contours: { value: params.contours },
  u_texel: { value: new THREE.Vector2(1 / meta.width, 1 / meta.height) },
  u_probe: { value: new THREE.Vector3(0, 0, 0) },
  u_micro: { value: params.microRelief },
  u_sunDir: { value: new THREE.Vector3(...sunDir.dir) },
  u_moonDir: { value: new THREE.Vector3(...moonDir.dir) },
  u_sunDist: { value: sunDir.distanceM },
  u_moonDist: { value: moonDir.distanceM },
  u_tidalBoost: { value: params.tidalBoost },
  u_gravOn: { value: params.gravOn ? 1 : 0 },
  u_rotOn: { value: params.rotOn ? 1 : 0 },
  u_tidalOn: { value: params.tidalOn ? 1 : 0 },
  u_exaggeration: { value: params.exaggeration },
  u_time: { value: 0 },
});

export default function Earth() {
  const matRef = useRef();
  const stateRef = useRef({ meta: null, tex: null });

  const exaggeration = useAtomValue(exaggerationAtom);
  const tidalBoost = useAtomValue(tidalBoostAtom);
  const heatmapMix = useAtomValue(heatmapMixAtom);
  const displaceAmount = useAtomValue(displaceAmountAtom);
  const contours = useAtomValue(contoursAtom);
  const microRelief = useAtomValue(microReliefAtom);
  const gravOn = useAtomValue(gravOnAtom);
  const rotOn = useAtomValue(rotOnAtom);
  const tidalOn = useAtomValue(tidalOnAtom);
  const sunDir = useAtomValue(sunDirectionAtom);
  const moonDir = useAtomValue(moonDirectionAtom);

  // Load metadata and heightmap (once only, dependencies intentionally empty)
  useEffect(() => {
    (async () => {
      const meta = await fetch('/data/metadata.json').then((r) => r.json());
      const tex = await new THREE.TextureLoader().loadAsync('/data/heightmap_rg16.png');
      tex.colorSpace = THREE.NoColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      stateRef.current = { meta, tex };

      // Init uniforms after first load
      if (matRef.current && !matRef.current.uniforms) {
        const params = {
          exaggeration,
          tidalBoost,
          heatmapMix,
          displaceAmount,
          contours,
          microRelief,
          gravOn,
          rotOn,
          tidalOn,
        };
        matRef.current.uniforms = createEarthUniforms(meta, tex, params, sunDir, moonDir);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update uniforms from atoms each frame
  useFrame((state, dt) => {
    if (!matRef.current || !matRef.current.uniforms) return;

    const u = matRef.current.uniforms;
    u.u_exaggeration.value = exaggeration;
    u.u_tidalBoost.value = tidalBoost;
    u.u_heatmapMix.value = heatmapMix;
    u.u_displaceAmount.value = displaceAmount;
    u.u_contours.value = contours;
    u.u_micro.value = microRelief;
    u.u_gravOn.value = gravOn ? 1 : 0;
    u.u_rotOn.value = rotOn ? 1 : 0;
    u.u_tidalOn.value = tidalOn ? 1 : 0;
    u.u_sunDir.value.fromArray(sunDir.dir);
    u.u_moonDir.value.fromArray(moonDir.dir);
    u.u_sunDist.value = sunDir.distanceM;
    u.u_moonDist.value = moonDir.distanceM;
    u.u_time.value += dt;
  });

  return (
    <mesh>
      <sphereGeometry args={[1, 512, 256]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={earthVertex}
        fragmentShader={earthFragment}
      />
    </mesh>
  );
}
