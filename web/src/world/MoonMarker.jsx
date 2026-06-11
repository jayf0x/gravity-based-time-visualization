import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAtomValue } from 'jotai';
import { moonDirectionAtom } from '../store/atoms';

export default function MoonMarker() {
  const meshRef = useRef();
  const moonDir = useAtomValue(moonDirectionAtom);

  useFrame(() => {
    if (!meshRef.current) return;
    meshRef.current.position.fromArray(moonDir.dir).multiplyScalar(8);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.07, 12, 12]} />
      <meshBasicMaterial color={0x9aa3b5} />
    </mesh>
  );
}
