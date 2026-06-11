import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';
import { useAtomValue } from 'jotai';
import { flyModeAtom } from '../store/atoms';

export default function Controls() {
  const { camera, gl } = useThree();
  const orbitRef = useRef(null);
  const flyRef = useRef(null);
  const flyMode = useAtomValue(flyModeAtom);

  // Initialize OrbitControls
  useEffect(() => {
    if (!orbitRef.current) {
      const c = new OrbitControls(camera, gl.domElement);
      c.enableDamping = true;
      c.dampingFactor = 0.06;
      c.minDistance = 1.02;
      c.maxDistance = 12;
      orbitRef.current = c;
    }

    return () => {
      if (orbitRef.current) {
        orbitRef.current.dispose();
      }
    };
  }, [camera, gl]);

  // Switch between fly and orbit modes
  useEffect(() => {
    if (flyMode) {
      // Enter fly mode
      if (orbitRef.current) {
        orbitRef.current.dispose();
        orbitRef.current = null;
      }
      if (!flyRef.current) {
        const f = new FlyControls(camera, gl.domElement);
        f.rollSpeed = 0.5;
        f.dragToLook = true;
        flyRef.current = f;
      }
    } else {
      // Exit fly mode, return to orbit
      if (flyRef.current) {
        flyRef.current.dispose();
        flyRef.current = null;
      }
      if (!orbitRef.current) {
        const c = new OrbitControls(camera, gl.domElement);
        c.enableDamping = true;
        c.dampingFactor = 0.06;
        c.minDistance = 1.02;
        c.maxDistance = 12;
        orbitRef.current = c;
      }
    }
  }, [flyMode, camera, gl]);

  // Update controls each frame
  useFrame((state, dt) => {
    if (orbitRef.current) {
      orbitRef.current.update();
    } else if (flyRef.current) {
      flyRef.current.update(dt);
    }
  });

  return null;
}
