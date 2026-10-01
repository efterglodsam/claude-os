import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AGENT_COLORS, TEMPLATES } from './templates';
import type { Agent, Business, Interactable, Panel, Task } from './types';

export const BASE_SECONDS = 8;
export const MAX_AGENTS = 8;

const uid = () => Math.random().toString(36).slice(2, 9);

export interface NewBusinessInput {
  name: string;
  template: string;
  color: string;
  customStages?: string[];
  revenuePerTask: number;
}

function buildBusiness(input: NewBusinessInput) {
  const tpl = TEMPLATES[input.template] ?? TEMPLATES.custom;
  const stages = tpl.stages.length ? tpl.stages : (input.customStages ?? []);
  const business: Business = {
    id: uid(),
    name: input.name,
    color: input.color,
    stages,
    unitLabel: tpl.unitLabel,
    unitsPerTask: tpl.unitsPerTask,
    revenuePerTask: input.revenuePerTask,
    done: 0,
    units: 0,
    revenue: 0,
  };
  const agents: Agent[] = [];
  for (let stage = 1; stage < stages.length - 1; stage++) {
    agents.push({
      id: uid(),
      businessId: business.id,
      name: tpl.agents[stage - 1] ?? stages[stage],
      stage,
      speed: 1,
      color: AGENT_COLORS[agents.length % AGENT_COLORS.length],
    });
  }
  const tasks: Task[] = tpl.tasks.map((title) => ({ id: uid(), businessId: business.id, title, stage: 0, progress: 0 }));
  return { business, agents, tasks };
}

function seed() {
  const s = buildBusiness({
    name: 'Clipping',
    template: 'clipping',
    color: TEMPLATES.clipping.color,
    revenuePerTask: TEMPLATES.clipping.revenuePerTask,
  });
  return { businesses: [s.business], agents: s.agents, tasks: s.tasks, currentId: s.business.id };
}

interface State {
  businesses: Business[];
  agents: Agent[];
  tasks: Task[];
  currentId: string;
  panel: Panel;
  nearby: Interactable | null;
  locked: boolean;

  setPanel: (p: Panel) => void;
  setNearby: (n: Interactable | null) => void;
  setLocked: (l: boolean) => void;
  interact: () => void;
  goTo: (id: string) => void;

  addBusiness: (input: NewBusinessInput) => void;
  removeBusiness: (id: string) => void;
  addTask: (businessId: string, title: string) => void;
  startTask: (id: string) => void;
  startAll: (businessId: string) => void;
  removeTask: (id: string) => void;
  hireAgent: (businessId: string, name: string, stage: number) => void;
  updateAgent: (id: string, patch: Partial<Pick<Agent, 'name' | 'speed'>>) => void;
  fireAgent: (id: string) => void;
  tick: (dt: number) => void;
  reset: () => void;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...seed(),
      panel: null,
      nearby: null,
      locked: false,

      setPanel: (panel) => set({ panel }),
      setNearby: (nearby) => set({ nearby }),
      setLocked: (locked) => set({ locked }),
      interact: () => {
        const n = get().nearby;
        if (!n) return;
        if (n.kind === 'whiteboard') set({ panel: { type: 'kanban' } });
        else if (n.kind === 'stats') set({ panel: { type: 'stats' } });
        else if (n.kind === 'elevator') set({ panel: { type: 'elevator' } });
        else if (n.kind === 'desk' && n.id) set({ panel: { type: 'agent', id: n.id } });
      },
      goTo: (currentId) => set({ currentId }),

      addBusiness: (input) =>
        set((s) => {
          const b = buildBusiness(input);
          return {
            businesses: [...s.businesses, b.business],
            agents: [...s.agents, ...b.agents],
            tasks: [...s.tasks, ...b.tasks],
            currentId: b.business.id,
          };
        }),
      removeBusiness: (id) =>
        set((s) => {
          if (s.businesses.length <= 1) return s;
          const businesses = s.businesses.filter((b) => b.id !== id);
          return {
            businesses,
            agents: s.agents.filter((a) => a.businessId !== id),
            tasks: s.tasks.filter((t) => t.businessId !== id),
            currentId: s.currentId === id ? businesses[0].id : s.currentId,
          };
        }),

      addTask: (businessId, title) =>
        set((s) => ({ tasks: [...s.tasks, { id: uid(), businessId, title, stage: 0, progress: 0 }] })),
      startTask: (id) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id && t.stage === 0 ? { ...t, stage: 1 } : t)) })),
      startAll: (businessId) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.businessId === businessId && t.stage === 0 ? { ...t, stage: 1 } : t)),
        })),
      removeTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          agents: s.agents.map((a) => (a.taskId === id ? { ...a, taskId: undefined } : a)),
        })),

      hireAgent: (businessId, name, stage) =>
        set((s) => {
          const mine = s.agents.filter((a) => a.businessId === businessId);
          if (mine.length >= MAX_AGENTS) return s;
          const agent: Agent = {
            id: uid(),
            businessId,
            name: name.trim() || 'Ny agent',
            stage,
            speed: 1,
            color: AGENT_COLORS[mine.length % AGENT_COLORS.length],
          };
          return { agents: [...s.agents, agent] };
        }),
      updateAgent: (id, patch) => set((s) => ({ agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
      fireAgent: (id) =>
        set((s) => {
          const agent = s.agents.find((a) => a.id === id);
          return {
            agents: s.agents.filter((a) => a.id !== id),
            tasks: s.tasks.map((t) => (t.assignee === id ? { ...t, assignee: undefined, progress: 0 } : t)),
            panel: s.panel?.type === 'agent' && agent ? null : s.panel,
          };
        }),

      tick: (dt) =>
        set((s) => {
          if (!s.agents.length) return s;
          const tasks = s.tasks.map((t) => ({ ...t }));
          const agents = s.agents.map((a) => ({ ...a }));
          const businesses = s.businesses.map((b) => ({ ...b }));
          for (const a of agents) {
            const b = businesses.find((x) => x.id === a.businessId);
            if (!b) continue;
            let task = a.taskId ? tasks.find((t) => t.id === a.taskId) : undefined;
            if (!task) {
              task = tasks.find((t) => t.businessId === a.businessId && t.stage === a.stage && !t.assignee);
              if (!task) {
                a.taskId = undefined;
                continue;
              }
              task.assignee = a.id;
              task.progress = 0;
              a.taskId = task.id;
            }
            task.progress += (dt * a.speed) / BASE_SECONDS;
            if (task.progress >= 1) {
              task.stage += 1;
              task.progress = 0;
              task.assignee = undefined;
              a.taskId = undefined;
              if (task.stage >= b.stages.length - 1) {
                b.done += 1;
                b.units += b.unitsPerTask;
                b.revenue += b.revenuePerTask;
              }
            }
          }
          return { tasks, agents, businesses };
        }),

      reset: () => set({ ...seed(), panel: null }),
    }),
    {
      name: 'clipfarm-v1',
      partialize: (s) => ({ businesses: s.businesses, agents: s.agents, tasks: s.tasks, currentId: s.currentId }),
    },
  ),
);

/** Lokala koordinater för skrivbord i ett våningsplan. */
export function deskPosition(index: number): [number, number] {
  return [-5.5 + (index % 4) * 4.5, 0.5 + Math.floor(index / 4) * 4];
}
