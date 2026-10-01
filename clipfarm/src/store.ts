import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AGENT_COLORS, TEMPLATES } from './templates';
import { api } from './api';
import type { Agent, Business, CeoState, Health, HireProposal, Interactable, Panel, PlatformStats, ServerJob, Task } from './types';

export const BASE_SECONDS = 8;
export const MAX_AGENTS = 8;

export const CEO_NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Alan', 'Hedy'];

export function defaultCeo(index: number): CeoState {
  return { name: CEO_NAMES[index % CEO_NAMES.length], auto: true, autoApprove: false, maxAgents: MAX_AGENTS, proposals: [], chat: [], log: [] };
}

export const uid = () => Math.random().toString(36).slice(2, 9);

export interface NewBusinessInput {
  name: string;
  template: string;
  color: string;
  customStages?: string[];
  revenuePerTask: number;
  live?: boolean;
}

function buildBusiness(input: NewBusinessInput) {
  const tpl = TEMPLATES[input.template] ?? TEMPLATES.custom;
  const stages = tpl.stages.length ? tpl.stages : (input.customStages ?? []);
  const business: Business = {
    id: uid(),
    name: input.name,
    color: input.color,
    stages,
    unitLabel: input.live ? 'färdiga klipp' : tpl.unitLabel,
    live: input.live,
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
  const tasks: Task[] = (input.live ? [] : tpl.tasks).map((title) => ({ id: uid(), businessId: business.id, title, stage: 0, progress: 0 }));
  return { business, agents, tasks };
}

function seed() {
  const s = buildBusiness({
    name: 'Clipping',
    template: 'clipping',
    color: TEMPLATES.clipping.color,
    revenuePerTask: 0,
    live: true,
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
  serverOnline: boolean;
  health: Health | null;
  platformStats: PlatformStats[];
  notice: string | null;
  ceo: Record<string, CeoState>;
  ceoBusy: Record<string, boolean>;

  patchCeo: (businessId: string, patch: Partial<CeoState>) => void;
  ceoLog: (businessId: string, text: string) => void;
  ceoChat: (businessId: string, role: 'user' | 'ceo', text: string) => void;
  addProposals: (businessId: string, p: Omit<HireProposal, 'id'>[]) => void;
  resolveProposal: (businessId: string, id: string, approve: boolean) => void;
  setCeoBusy: (businessId: string, busy: boolean) => void;
  delegateTask: (taskId: string, agentId: string) => void;
  setPanel: (p: Panel) => void;
  setNearby: (n: Interactable | null) => void;
  setLocked: (l: boolean) => void;
  setNotice: (n: string | null) => void;
  syncLive: (jobs: ServerJob[]) => void;
  setServer: (online: boolean, health?: Health | null, stats?: PlatformStats[]) => void;
  retryTask: (id: string) => void;
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

const isLive = (s: State, businessId: string) => !!s.businesses.find((b) => b.id === businessId)?.live;

/** Anropar backend och uppdaterar direkt; fel visas som notis. */
function remote(method: string, path: string, body?: unknown) {
  api(method, path, body)
    .then(() => refreshLive())
    .catch((e: Error) => useStore.getState().setNotice(e.message));
}

let rosterSig = '';

export async function refreshLive() {
  const st = useStore.getState();
  try {
    const live = st.businesses.find((b) => b.live);
    if (live) {
      const roster = st.agents.filter((a) => a.businessId === live.id).map((a) => ({ id: a.id, stage: a.stage }));
      const sig = JSON.stringify(roster);
      if (sig !== rosterSig) {
        await api('PUT', '/api/roster', { agents: roster });
        rosterSig = sig;
      }
    }
    st.syncLive(await api<ServerJob[]>('GET', '/api/jobs'));
    if (!st.serverOnline) st.setServer(true);
  } catch {
    rosterSig = '';
    if (st.serverOnline) st.setServer(false);
    else if (st.health === null) st.setServer(false);
  }
}

export async function refreshInfo() {
  try {
    const [health, stats] = await Promise.all([api<Health>('GET', '/api/health'), api<PlatformStats[]>('GET', '/api/stats')]);
    useStore.getState().setServer(true, health, stats);
  } catch {
    useStore.getState().setServer(false);
  }
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...seed(),
      panel: null,
      nearby: null,
      locked: false,
      serverOnline: false,
      health: null,
      platformStats: [],
      notice: null,
      ceo: {},
      ceoBusy: {},

      patchCeo: (id, patch) =>
        set((s) => ({ ceo: { ...s.ceo, [id]: { ...(s.ceo[id] ?? defaultCeo(s.businesses.findIndex((b) => b.id === id))), ...patch } } })),
      ceoLog: (id, text) => {
        const c = get().ceo[id] ?? defaultCeo(get().businesses.findIndex((b) => b.id === id));
        get().patchCeo(id, { log: [...c.log.slice(-39), { t: Date.now(), text }] });
      },
      ceoChat: (id, role, text) => {
        const c = get().ceo[id] ?? defaultCeo(get().businesses.findIndex((b) => b.id === id));
        get().patchCeo(id, { chat: [...c.chat.slice(-39), { role, text }] });
      },
      addProposals: (id, ps) => {
        const c = get().ceo[id] ?? defaultCeo(get().businesses.findIndex((b) => b.id === id));
        get().patchCeo(id, { proposals: [...c.proposals, ...ps.map((p) => ({ ...p, id: uid() }))] });
      },
      resolveProposal: (id, pid, approve) => {
        const st = get();
        const c = st.ceo[id];
        const p = c?.proposals.find((x) => x.id === pid);
        if (!c || !p) return;
        if (approve) {
          const count = st.agents.filter((a) => a.businessId === id).length;
          if (count >= Math.min(c.maxAgents, MAX_AGENTS)) return set({ notice: 'Max antal agenter är nått – höj gränsen i CEO-inställningarna.' });
          st.hireAgent(id, p.name, p.stage);
          st.ceoLog(id, `Du godkände anställning: ${p.name}`);
        } else st.ceoLog(id, `Du avslog anställning: ${p.name}`);
        get().patchCeo(id, { proposals: get().ceo[id].proposals.filter((x) => x.id !== pid) });
      },
      setCeoBusy: (id, busy) => set((s) => ({ ceoBusy: { ...s.ceoBusy, [id]: busy } })),
      delegateTask: (taskId, agentId) => {
        const t = get().tasks.find((x) => x.id === taskId);
        if (!t) return;
        set((s) => ({ tasks: s.tasks.map((x) => (x.id === taskId ? { ...x, delegatedTo: agentId } : x)) }));
        if (isLive(get(), t.businessId)) remote('POST', `/api/jobs/${taskId}/delegate`, { agentId });
      },
      setPanel: (panel) => set({ panel }),
      setNearby: (nearby) => set({ nearby }),
      setLocked: (locked) => set({ locked }),
      setNotice: (notice) => set({ notice }),
      setServer: (serverOnline, health, stats) =>
        set((s) => ({
          serverOnline,
          health: health === undefined ? s.health : health,
          platformStats: stats ?? s.platformStats,
        })),
      syncLive: (jobs) =>
        set((s) => {
          const live = s.businesses.find((b) => b.live);
          if (!live) return s;
          const last = live.stages.length - 1;
          const mapped: Task[] = jobs.map((j) => {
            const agent = j.status === 'working' ? s.agents.find((a) => a.id === j.agentId) ?? s.agents.find((a) => a.businessId === live.id && a.stage === j.stage) : undefined;
            return {
              id: j.id,
              businessId: live.id,
              title: j.title,
              stage: j.stage,
              progress: j.progress,
              assignee: agent?.id,
              delegatedTo: j.delegation?.[j.stage],
              error: j.status === 'failed' ? j.error ?? 'Misslyckades' : undefined,
              queued: j.status === 'queued' && j.stage > 0,
              clips: j.clips
                .filter((c) => c.file && c.qa?.pass !== false)
                .map((c) => ({ title: c.title, file: '/clips/' + (c.file as string).split('/clips/')[1] })),
            };
          });
          const done = jobs.filter((j) => j.status === 'done' && j.stage === last);
          return {
            tasks: [...s.tasks.filter((t) => t.businessId !== live.id), ...mapped],
            agents: s.agents.map((a) =>
              a.businessId === live.id ? { ...a, taskId: mapped.find((t) => t.assignee === a.id)?.id } : a,
            ),
            businesses: s.businesses.map((b) =>
              b.id === live.id
                ? { ...b, done: done.length, units: done.reduce((n, j) => n + j.clips.filter((c) => c.qa?.pass).length, 0) }
                : b,
            ),
          };
        }),
      interact: () => {
        const n = get().nearby;
        if (!n) return;
        if (n.kind === 'whiteboard') set({ panel: { type: 'kanban' } });
        else if (n.kind === 'stats') set({ panel: { type: 'stats' } });
        else if (n.kind === 'elevator') set({ panel: { type: 'elevator' } });
        else if (n.kind === 'ceo') set({ panel: { type: 'ceo' } });
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
            ceo: Object.fromEntries(Object.entries(s.ceo).filter(([k]) => k !== id)),
          };
        }),

      addTask: (businessId, title) => {
        if (isLive(get(), businessId)) return remote('POST', '/api/jobs', { url: title });
        set((s) => ({ tasks: [...s.tasks, { id: uid(), businessId, title, stage: 0, progress: 0 }] }));
      },
      startTask: (id) => {
        const t = get().tasks.find((x) => x.id === id);
        if (t && isLive(get(), t.businessId)) return remote('POST', `/api/jobs/${id}/start`);
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id && t.stage === 0 ? { ...t, stage: 1 } : t)) }));
      },
      startAll: (businessId) => {
        if (isLive(get(), businessId)) return remote('POST', '/api/jobs/start-all');
        set((s) => ({
          tasks: s.tasks.map((t) => (t.businessId === businessId && t.stage === 0 ? { ...t, stage: 1 } : t)),
        }));
      },
      retryTask: (id) => {
        remote('POST', `/api/jobs/${id}/retry`);
      },
      removeTask: (id) => {
        const t = get().tasks.find((x) => x.id === id);
        if (t && isLive(get(), t.businessId)) return remote('DELETE', `/api/jobs/${id}`);
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          agents: s.agents.map((a) => (a.taskId === id ? { ...a, taskId: undefined } : a)),
        }));
      },

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
            tasks: s.tasks.map((t) => {
              const x = t.delegatedTo === id ? { ...t, delegatedTo: undefined } : t;
              return x.assignee === id ? { ...x, assignee: undefined, progress: 0 } : x;
            }),
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
            if (!b || b.live) continue;
            let task = a.taskId ? tasks.find((t) => t.id === a.taskId) : undefined;
            if (!task) {
              const open = tasks.filter((t) => t.businessId === a.businessId && t.stage === a.stage && !t.assignee);
              task =
                open.find((t) => t.delegatedTo === a.id) ??
                open.find((t) => {
                  const d = agents.find((x) => x.id === t.delegatedTo);
                  return !d || !!d.taskId; // ej delegerat, eller delegerad agent är upptagen
                });
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
      name: 'clipfarm-v2',
      partialize: (s) => ({ businesses: s.businesses, agents: s.agents, tasks: s.tasks, currentId: s.currentId, ceo: s.ceo }),
    },
  ),
);

/** Lokala koordinater för skrivbord i ett våningsplan. */
export function deskPosition(index: number): [number, number] {
  return [-5.5 + (index % 4) * 4.5, 0.5 + Math.floor(index / 4) * 4];
}
