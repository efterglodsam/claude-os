import { PointerLockControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useStore } from '../store';
import { Floor } from './Floor';
import { Player } from './Player';

export function Scene() {
  const businesses = useStore((s) => s.businesses);
  return (
    <Canvas camera={{ fov: 70, near: 0.1, far: 200 }}>
      <color attach="background" args={['#070a16']} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#bcd0ff', '#1a1f3a', 0.8]} />
      {businesses.map((b, i) => (
        <Floor key={b.id} business={b} index={i} isLast={i === businesses.length - 1} />
      ))}
      <Player />
      <PointerLockControls />
    </Canvas>
  );
}
