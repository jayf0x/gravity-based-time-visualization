import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useAtomValue } from 'jotai';
import {
  fogOnAtom,
  fogDensityAtom,
  flowSpeedAtom,
  twistAtom,
  tidalBoostAtom,
  exaggerationAtom,
  sunDirectionAtom,
  moonDirectionAtom,
  gravOnAtom,
  rotOnAtom,
  tidalOnAtom,
} from '../store/atoms';
import { fogVertex, fogFragment } from '../shaders';

const SHELL_OUTER = 2.6;

const createFogUniforms = (meta, tex, params, sunDir, moonDir) => ({
  u_heightmap: { value: tex },
  u_elevMin: { value: meta.elevation_min_m },
  u_elevMax: { value: meta.elevation_max_m },
  u_fogDensity: { value: params.fogDensity },
  u_flowSpeed: { value: params.flowSpeed },
  u_twist: { value: params.twist },
  u_shellOuter: { value: SHELL_OUTER },
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

export default function Fog() {
  const meshRef = useRef();
  const matRef = useRef();
  const stateRef = useRef({ meta: null, tex: null });

  const fogOn = useAtomValue(fogOnAtom);
  const fogDensity = useAtomValue(fogDensityAtom);
  const flowSpeed = useAtomValue(flowSpeedAtom);
  const twist = useAtomValue(twistAtom);
  const tidalBoost = useAtomValue(tidalBoostAtom);
  const exaggeration = useAtomValue(exaggerationAtom);
  const sunDir = useAtomValue(sunDirectionAtom);
  const moonDir = useAtomValue(moonDirectionAtom);
  const gravOn = useAtomValue(gravOnAtom);
  const rotOn = useAtomValue(rotOnAtom);
  const tidalOn = useAtomValue(tidalOnAtom);

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

      if (matRef.current && !matRef.current.uniforms) {
        const params = {
          fogDensity,
          flowSpeed,
          twist,
          tidalBoost,
          exaggeration,
          gravOn,
          rotOn,
          tidalOn,
        };
        matRef.current.uniforms = createFogUniforms(meta, tex, params, sunDir, moonDir);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update uniforms each frame
  useFrame((state, dt) => {
    if (!meshRef.current || !matRef.current || !matRef.current.uniforms) return;

    const u = matRef.current.uniforms;
    meshRef.current.visible = fogOn;
    u.u_fogDensity.value = fogDensity;
    u.u_flowSpeed.value = flowSpeed;
    u.u_twist.value = twist;
    u.u_exaggeration.value = exaggeration;
    u.u_tidalBoost.value = tidalBoost;
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
    <mesh ref={meshRef} renderOrder={2} visible={fogOn}>
      <sphereGeometry args={[SHELL_OUTER, 48, 24]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={fogVertex}
        fragmentShader={fogFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
      />
    </mesh>
  );
}
