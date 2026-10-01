import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { Vector3 } from 'three';
import { defaultCeo, deskPosition, useStore } from '../store';
import type { Interactable } from '../types';
import { EYE, FLOOR_H, HALF_D, HALF_W } from './constants';

const SPEED = 5;
const forward = new Vector3();
const right = new Vector3();
const move = new Vector3();

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
}

function interactables(businessId: string): Interactable[] {
  const { agents } = useStore.getState();
  const list: Interactable[] = [
    { kind: 'whiteboard', label: 'Öppna Kanban-tavlan', x: 0, z: -6.5, r: 4.2 },
    { kind: 'stats', label: 'Visa statistik', x: HALF_W - 3.2, z: -6.5, r: 3 },
    { kind: 'elevator', label: 'Använd hissen', x: -HALF_W + 1.4, z: -5.5, r: 2.8 },
  ];
  const { ceo, businesses } = useStore.getState();
  const name = ceo[businessId]?.name ?? defaultCeo(businesses.findIndex((b) => b.id === businessId)).name;
  list.push({ kind: 'ceo', label: `Prata med CEO ${name}`, x: 10.4, z: 3.1, r: 2.4 });
  agents
    .filter((a) => a.businessId === businessId)
    .forEach((a, i) => {
      const [x, z] = deskPosition(i);
      list.push({ kind: 'desk', id: a.id, label: `Prata med ${a.name}`, x, z: z + 0.6, r: 2.2 });
    });
  return list;
}

export function Player() {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const baseY = useRef(0);
  const lastTarget = useRef<string>('');

  useEffect(() => {
    camera.position.set(0, EYE, 5);
    camera.lookAt(0, EYE, -5);
    const down = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const st = useStore.getState();
      if (st.panel) return;
      keys.current[e.code] = true;
      if (e.code === 'KeyE') st.interact();
    };
    const up = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };
    const blur = () => (keys.current = {});
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [camera]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const st = useStore.getState();
    const idx = Math.max(0, st.businesses.findIndex((b) => b.id === st.currentId));
    const targetY = idx * FLOOR_H;

    // hissen: byt våning => flytta spelaren till hissdörren och glid upp/ner
    if (lastTarget.current !== st.currentId) {
      if (lastTarget.current) camera.position.set(-HALF_W + 3.4, camera.position.y, -HALF_D + 3.5);
      lastTarget.current = st.currentId;
    }
    baseY.current += (targetY - baseY.current) * Math.min(1, dt * 3);
    camera.position.y = baseY.current + EYE;

    const k = keys.current;
    if (!st.panel) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      move.set(0, 0, 0);
      if (k.KeyW || k.ArrowUp) move.add(forward);
      if (k.KeyS || k.ArrowDown) move.sub(forward);
      if (k.KeyD || k.ArrowRight) move.add(right);
      if (k.KeyA || k.ArrowLeft) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(SPEED * dt);
        camera.position.x = Math.max(-HALF_W + 0.6, Math.min(HALF_W - 0.6, camera.position.x + move.x));
        camera.position.z = Math.max(-HALF_D + 0.6, Math.min(HALF_D - 0.6, camera.position.z + move.z));
      }
    }

    // närmaste interaktionspunkt
    let best: Interactable | null = null;
    let bestScore = 1;
    if (Math.abs(baseY.current - targetY) < 0.5) {
      for (const it of interactables(st.currentId)) {
        const score = Math.hypot(camera.position.x - it.x, camera.position.z - it.z) / it.r;
        if (score < bestScore) {
          bestScore = score;
          best = it;
        }
      }
    }
    const prev = st.nearby;
    if ((prev?.kind ?? null) !== (best?.kind ?? null) || prev?.id !== best?.id) st.setNearby(best);
  });

  return null;
}
