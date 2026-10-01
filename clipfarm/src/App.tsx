import { useEffect } from 'react';
import { Scene } from './scene/Scene';
import { useStore } from './store';
import { Hud } from './ui/Hud';
import { Panels } from './ui/Panels';

export default function App() {
  const panel = useStore((s) => s.panel);

  useEffect(() => {
    const id = setInterval(() => useStore.getState().tick(0.5), 500);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useStore.getState().setPanel(null);
    const onLock = () => useStore.getState().setLocked(!!document.pointerLockElement);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerlockchange', onLock);
    return () => {
      clearInterval(id);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerlockchange', onLock);
    };
  }, []);

  useEffect(() => {
    if (panel && document.pointerLockElement) document.exitPointerLock();
  }, [panel]);

  return (
    <>
      <Scene />
      <Hud />
      <Panels />
    </>
  );
}
