import { Text } from './Text';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { deskPosition, useStore } from '../store';
import type { Agent, Business, Task } from '../types';
import { FLOOR_H, HALF_D, HALF_W } from './constants';

const WALL = '#222b4d';

function Worker({ color, working }: { color: string; working: boolean }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (ref.current) ref.current.position.y = working ? Math.abs(Math.sin(clock.elapsedTime * 7)) * 0.04 : 0;
  });
  return (
    <group ref={ref}>
      <mesh position={[0, 0.85, 0]}>
        <capsuleGeometry args={[0.23, 0.45, 4, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.4, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#f1d3b3" />
      </mesh>
    </group>
  );
}

function Desk({ agent, task, index }: { agent: Agent; task?: Task; index: number }) {
  const [x, z] = deskPosition(index);
  const working = !!task;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.72, 0]}>
        <boxGeometry args={[2.2, 0.08, 1.1]} />
        <meshStandardMaterial color="#3b4572" />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 1, 0.36, 0]}>
          <boxGeometry args={[0.08, 0.72, 0.9]} />
          <meshStandardMaterial color="#2a3257" />
        </mesh>
      ))}
      {/* monitor */}
      <mesh position={[0, 1.2, -0.2]}>
        <boxGeometry args={[1.2, 0.7, 0.05]} />
        <meshStandardMaterial color="#05070f" />
      </mesh>
      <mesh position={[0, 1.2, -0.17]}>
        <planeGeometry args={[1.12, 0.62]} />
        <meshStandardMaterial
          color={working ? '#0f3d2b' : '#111827'}
          emissive={working ? '#22c55e' : '#1f2937'}
          emissiveIntensity={working ? 0.45 : 0.2}
        />
      </mesh>
      <Text position={[0, 1.34, -0.15]} fontSize={0.1} color="#e5e7eb" maxWidth={1.05}>
        {agent.name}
      </Text>
      <Text position={[0, 1.15, -0.15]} fontSize={0.075} color={working ? '#86efac' : '#9ca3af'} maxWidth={1.05}>
        {task ? task.title.slice(0, 40) : 'Väntar på jobb…'}
      </Text>
      {task && (
        <>
          <mesh position={[0, 0.95, -0.15]}>
            <planeGeometry args={[1.0, 0.04]} />
            <meshBasicMaterial color="#1f2937" />
          </mesh>
          <mesh position={[-0.5 + task.progress * 0.5, 0.95, -0.14]}>
            <planeGeometry args={[Math.max(0.001, task.progress * 1.0), 0.04]} />
            <meshBasicMaterial color="#22c55e" />
          </mesh>
        </>
      )}
      {/* chair + worker, sitter bakom skrivbordet mot spelaren */}
      <group position={[0, 0, -0.95]}>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.5, 0.08, 0.5]} />
          <meshStandardMaterial color="#111827" />
        </mesh>
        <Worker color={agent.color} working={working} />
      </group>
    </group>
  );
}

function Whiteboard({ business, tasks }: { business: Business; tasks: Task[] }) {
  const n = business.stages.length;
  const boardW = 10;
  const colW = boardW / n;
  return (
    <group position={[0, 2.5, -HALF_D + 0.17]}>
      <mesh>
        <boxGeometry args={[boardW + 0.4, 3.6, 0.08]} />
        <meshStandardMaterial color="#0d1226" />
      </mesh>
      {business.stages.map((stage, i) => {
        const cx = -boardW / 2 + colW * (i + 0.5);
        const col = tasks.filter((t) => t.stage === i);
        return (
          <group key={stage + i} position={[cx, 0, 0.05]}>
            <Text position={[0, 1.5, 0]} fontSize={0.18} color={business.color} maxWidth={colW - 0.1}>
              {stage}
            </Text>
            {col.slice(0, 5).map((t, j) => (
              <group key={t.id} position={[0, 1.0 - j * 0.5, 0]}>
                <mesh>
                  <planeGeometry args={[colW - 0.2, 0.42]} />
                  <meshBasicMaterial color={t.assignee ? '#166534' : '#2b3563'} />
                </mesh>
                <Text position={[0, 0, 0.01]} fontSize={0.11} color="#f3f4f6" maxWidth={colW - 0.3}>
                  {t.title.slice(0, 22)}
                </Text>
              </group>
            ))}
            {col.length > 5 && (
              <Text position={[0, 1.0 - 5 * 0.5, 0]} fontSize={0.12} color="#9ca3af">
                +{col.length - 5} till
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}

function StatsScreen({ business }: { business: Business }) {
  return (
    <group position={[HALF_W - 3.2, 2.2, -HALF_D + 0.2]}>
      <mesh>
        <boxGeometry args={[3, 2.2, 0.08]} />
        <meshStandardMaterial color="#05070f" />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[2.8, 2]} />
        <meshStandardMaterial color="#0b1b33" emissive="#0ea5e9" emissiveIntensity={0.25} />
      </mesh>
      <Text position={[0, 0.7, 0.07]} fontSize={0.2} color="#7dd3fc">
        Statistik
      </Text>
      <Text position={[0, 0.25, 0.07]} fontSize={0.17} color="#e5e7eb">
        {`Klara jobb: ${business.done}`}
      </Text>
      <Text position={[0, -0.15, 0.07]} fontSize={0.17} color="#e5e7eb">
        {`${business.units.toLocaleString('sv-SE')} ${business.unitLabel}`}
      </Text>
      <Text position={[0, -0.55, 0.07]} fontSize={0.17} color="#86efac">
        {`${business.revenue.toLocaleString('sv-SE')} kr`}
      </Text>
      <Text position={[0, -0.85, 0.07]} fontSize={0.07} color="#6b7280">
        (simulerade siffror)
      </Text>
    </group>
  );
}

function Elevator() {
  return (
    <group position={[-HALF_W + 1.4, 0, -HALF_D + 1]}>
      <mesh position={[0, 1.4, 0]}>
        <boxGeometry args={[2, 2.8, 1.4]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 1.2, 0.71]}>
        <planeGeometry args={[1.5, 2.3]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.3} />
      </mesh>
      <Text position={[0, 2.62, 0.72]} fontSize={0.2} color="#fbbf24">
        HISS
      </Text>
    </group>
  );
}

export function Floor({ business, index, isLast }: { business: Business; index: number; isLast: boolean }) {
  const allAgents = useStore((s) => s.agents);
  const allTasks = useStore((s) => s.tasks);
  const agents = allAgents.filter((a) => a.businessId === business.id);
  const tasks = allTasks.filter((t) => t.businessId === business.id);

  return (
    <group position={[0, index * FLOOR_H, 0]}>
      <pointLight position={[0, FLOOR_H - 1, 0]} intensity={90} distance={40} decay={1.6} />
      <pointLight position={[-6, FLOOR_H - 1, 4]} intensity={50} distance={25} decay={1.6} />
      <pointLight position={[6, FLOOR_H - 1, 4]} intensity={50} distance={25} decay={1.6} />
      {/* golv */}
      <mesh position={[0, -0.1, 0]}>
        <boxGeometry args={[HALF_W * 2 + 0.6, 0.2, HALF_D * 2 + 0.6]} />
        <meshStandardMaterial color="#1c2440" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]}>
        <planeGeometry args={[HALF_W * 2 - 2, HALF_D * 2 - 2]} />
        <meshStandardMaterial color={business.color} transparent opacity={0.14} />
      </mesh>
      {/* väggar */}
      <mesh position={[0, FLOOR_H / 2, -HALF_D - 0.15]}>
        <boxGeometry args={[HALF_W * 2 + 0.6, FLOOR_H, 0.3]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      <mesh position={[0, FLOOR_H / 2, HALF_D + 0.15]}>
        <boxGeometry args={[HALF_W * 2 + 0.6, FLOOR_H, 0.3]} />
        <meshStandardMaterial color={WALL} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (HALF_W + 0.15), FLOOR_H / 2, 0]}>
          <boxGeometry args={[0.3, FLOOR_H, HALF_D * 2]} />
          <meshStandardMaterial color={WALL} />
        </mesh>
      ))}
      <mesh position={[0, FLOOR_H - 0.45, -HALF_D + 0.02]}>
        <boxGeometry args={[HALF_W * 2, 0.08, 0.04]} />
        <meshBasicMaterial color={business.color} />
      </mesh>
      {isLast && (
        <mesh position={[0, FLOOR_H + 0.1, 0]}>
          <boxGeometry args={[HALF_W * 2 + 0.6, 0.2, HALF_D * 2 + 0.6]} />
          <meshStandardMaterial color="#1c2440" />
        </mesh>
      )}
      <Text position={[0, 4.95, -HALF_D + 0.08]} fontSize={0.55} color={business.color}>
        {business.name}
      </Text>

      <Whiteboard business={business} tasks={tasks} />
      <StatsScreen business={business} />
      <Elevator />
      {agents.map((a, i) => (
        <Desk key={a.id} agent={a} index={i} task={tasks.find((t) => t.id === a.taskId)} />
      ))}
    </group>
  );
}
