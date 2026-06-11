import { Canvas } from '@react-three/fiber';
import Scene from './Scene';

export default function WorldCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 1.1, 3.2], fov: 45, near: 0.01, far: 100 }}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }}
    >
      <Scene />
    </Canvas>
  );
}
