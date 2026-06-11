/* eslint-disable react-hooks/purity */
import { useMemo } from 'react';
import * as THREE from 'three';
import { starVertex, starFragment } from '../shaders';

export default function Starfield({ count = 4000 }) {
  const { geometry, material } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const mag = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const r = 40 + Math.random() * 20;
      pos.set([r * s * Math.sin(th), r * u, r * s * Math.cos(th)], i * 3);
      mag[i] = 0.4 + Math.random() ** 3 * 2.2;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('a_mag', new THREE.BufferAttribute(mag, 1));

    const m = new THREE.ShaderMaterial({
      vertexShader: starVertex,
      fragmentShader: starFragment,
      transparent: true,
      depthWrite: false,
    });

    return { geometry: g, material: m };
  }, [count]);

  return <points geometry={geometry} material={material} />;
}
