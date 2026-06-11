import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useAtomValue } from 'jotai';
import {
  wellDepthAtom,
  regionSpanAtom,
  cityAtom,
  sunDirectionAtom,
  moonDirectionAtom,
  tidalBoostAtom,
  exaggerationAtom,
  gravOnAtom,
  rotOnAtom,
  tidalOnAtom,
  CITIES,
} from '../store/atoms';
import { minimapVertex, minimapFragment } from '../shaders';

const MINI = { w: 300, h: 210, pad: 14 };

export default function Minimap() {
  const { gl } = useThree();
  const miniSceneRef = useRef(new THREE.Scene());
  const miniCameraRef = useRef(new THREE.PerspectiveCamera(40, 300 / 210, 0.1, 20));
  const miniMeshRef = useRef();
  const matRef = useRef();
  const stateRef = useRef({ metadata: null, elevGrid: null });

  const wellDepth = useAtomValue(wellDepthAtom);
  const regionSpan = useAtomValue(regionSpanAtom);
  const city = useAtomValue(cityAtom);
  const sunDir = useAtomValue(sunDirectionAtom);
  const moonDir = useAtomValue(moonDirectionAtom);
  const tidalBoost = useAtomValue(tidalBoostAtom);
  const exaggeration = useAtomValue(exaggerationAtom);
  const gravOn = useAtomValue(gravOnAtom);
  const rotOn = useAtomValue(rotOnAtom);
  const tidalOn = useAtomValue(tidalOnAtom);

  // Initialize minimap scene (once only)
  useEffect(() => {
    const miniCamera = miniCameraRef.current;
    miniCamera.position.set(0, -1.9, 1.45);
    miniCamera.lookAt(0, 0, 0);

    (async () => {
      const meta = await fetch('/data/metadata.json').then((r) => r.json());
      stateRef.current.metadata = meta;

      const mat = matRef.current;
      if (mat && !mat.uniforms) {
        mat.uniforms = {
          u_heightmap: { value: null },
          u_elevMin: { value: meta.elevation_min_m },
          u_elevMax: { value: meta.elevation_max_m },
          u_center: { value: new THREE.Vector2(0, 0) },
          u_spanLat: { value: 180 },
          u_spanLon: { value: 360 },
          u_zScale: { value: wellDepth },
          u_sunDir: { value: new THREE.Vector3(...sunDir.dir) },
          u_moonDir: { value: new THREE.Vector3(...moonDir.dir) },
          u_sunDist: { value: sunDir.distanceM },
          u_moonDist: { value: moonDir.distanceM },
          u_tidalBoost: { value: tidalBoost },
          u_gravOn: { value: gravOn ? 1 : 0 },
          u_rotOn: { value: rotOn ? 1 : 0 },
          u_tidalOn: { value: tidalOn ? 1 : 0 },
          u_exaggeration: { value: exaggeration },
          u_time: { value: 0 },
        };

        const tex = await new THREE.TextureLoader().loadAsync('/data/heightmap_rg16.png');
        tex.colorSpace = THREE.NoColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearFilter;
        tex.generateMipmaps = false;
        mat.uniforms.u_heightmap.value = tex;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update region based on selected city
  useEffect(() => {
    if (!miniMeshRef.current || !matRef.current) return;
    const latLon = CITIES[city];
    const mat = matRef.current;

    if (!latLon) {
      mat.uniforms.u_center.value.set(0, 0);
      mat.uniforms.u_spanLat.value = 180;
      mat.uniforms.u_spanLon.value = 360;
      miniMeshRef.current.scale.set(1, 0.78, 1);
    } else {
      mat.uniforms.u_center.value.set(latLon[0], latLon[1]);
      mat.uniforms.u_spanLat.value = regionSpan;
      mat.uniforms.u_spanLon.value = regionSpan;
      miniMeshRef.current.scale.set(0.78, 1, 1);
    }
  }, [city, regionSpan]);

  // Render minimap each frame
  useFrame(() => {
    if (!matRef.current || !matRef.current.uniforms) return;

    const u = matRef.current.uniforms;
    u.u_zScale.value = wellDepth;
    u.u_sunDir.value.fromArray(sunDir.dir);
    u.u_moonDir.value.fromArray(moonDir.dir);
    u.u_sunDist.value = sunDir.distanceM;
    u.u_moonDist.value = moonDir.distanceM;
    u.u_tidalBoost.value = tidalBoost;
    u.u_exaggeration.value = exaggeration;
    u.u_gravOn.value = gravOn ? 1 : 0;
    u.u_rotOn.value = rotOn ? 1 : 0;
    u.u_tidalOn.value = tidalOn ? 1 : 0;

    // Render minimap with scissor
    const w = gl.domElement.clientWidth;
    const h = gl.domElement.clientHeight;
    const x = w - MINI.w - MINI.pad;
    const y = MINI.pad;

    gl.setScissorTest(true);
    gl.setScissor(x, y, MINI.w, MINI.h);
    gl.setViewport(x, y, MINI.w, MINI.h);
    gl.clearDepth();
    gl.render(miniSceneRef.current, miniCameraRef.current);
    gl.setScissorTest(false);
    gl.setViewport(0, 0, w, h);
  });

  return (
    <>
      {/* Create minimap mesh and add to miniScene in useEffect */}
      <mesh
        ref={miniMeshRef}
        position={[0, 0, 0]}
        onUpdate={(self) => {
          if (!miniSceneRef.current.children.includes(self)) {
            miniSceneRef.current.add(self);
          }
        }}
      >
        <planeGeometry args={[2.6, 1.6, 128, 96]} />
        <shaderMaterial
          ref={matRef}
          vertexShader={minimapVertex}
          fragmentShader={minimapFragment}
          side={THREE.DoubleSide}
          transparent
        />
      </mesh>
    </>
  );
}
