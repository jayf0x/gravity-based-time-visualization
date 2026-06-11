import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAtomValue } from 'jotai';
import { sunDirectionAtom } from '../store/atoms';

export default function SunMarker() {
  const meshRef = useRef();
  const sunDir = useAtomValue(sunDirectionAtom);

  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.position.fromArray(sunDir.dir).multiplyScalar(25);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.35, 16, 16]} />
      <meshBasicMaterial color={0xfff2cc} />
    </mesh>
  );
}
