// Toolchain smoke test: proves the React/R3F/jotai/babel pipeline transforms.
// Requested by qa/check_alignment.py (stage react); not part of the app.
import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { atom, useAtomValue } from 'jotai';
import { motion } from 'framer-motion';

const smokeAtom = atom('ok');

export function Smoke() {
  const [n] = useState(1);
  const v = useAtomValue(smokeAtom);
  return (
    <motion.div animate={{ opacity: n }}>
      {v}
      <Canvas>
        <mesh>
          <sphereGeometry args={[1, 8, 8]} />
          <meshBasicMaterial color="cyan" />
        </mesh>
      </Canvas>
    </motion.div>
  );
}
