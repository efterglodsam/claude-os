import { useEffect } from 'react';
import { ceoAutoTick } from './ceo';
import { Scene } from './scene/Scene';
import { refreshInfo, refreshLive, useStore } from './store';
import { Hud } from './ui/Hud';
import { Panels } from './ui/Panels';

export default function App() {
  const panel = useStore((s) => s.panel);

  useEffect(() => {
    const id = setInterval(() => useStore.getState().tick(0.5), 500);
    refreshLive();
    refreshInfo();
    const live = setInterval(refreshLive, 2000);
    const info = setInterval(refreshInfo, 30000);
    const ceoLoop = setInterval(ceoAutoTick, 5000);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useStore.getState().setPanel(null);
    const onLock = () => useStore.getState().setLocked(!!document.pointerLockElement);
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerlockchange', onLock);
    return () => {
      clearInterval(id);
      clearInterval(live);
      clearInterval(info);
      clearInterval(ceoLoop);
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
