import { api } from './api';
import { defaultCeo, MAX_AGENTS, useStore } from './store';
import type { Business } from './types';

interface CeoReply {
  reply: string;
  hires: { name: string; stage: number; rationale: string }[];
  delegations: { taskId: string; agentId: string; reason: string }[];
}

const lastRun: Record<string, number> = {};

/** Låter business-CEO:n göra en genomgång (och ev. svara på ett meddelande). */
export async function runCeo(businessId: string, message?: string) {
  const st = useStore.getState();
  const b = st.businesses.find((x) => x.id === businessId);
  if (!b || st.ceoBusy[businessId]) return;
  const ceo = st.ceo[businessId] ?? defaultCeo(st.businesses.indexOf(b));
  const agents = st.agents.filter((a) => a.businessId === businessId);
  const tasks = st.tasks.filter((t) => t.businessId === businessId && t.stage < b.stages.length - 1);

  lastRun[businessId] = Date.now();
  st.setCeoBusy(businessId, true);
  if (message) st.ceoChat(businessId, 'user', message);
  try {
    const res = await api<CeoReply>('POST', '/api/ceo', {
      business: { name: b.name, stages: b.stages, live: !!b.live, unitLabel: b.unitLabel },
      ceoName: ceo.name,
      agents: agents.map((a) => ({ id: a.id, name: a.name, stage: a.stage, busy: !!a.taskId })),
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, stage: t.stage, running: !!t.assignee, delegatedTo: t.delegatedTo })),
      maxAgents: Math.min(ceo.maxAgents, MAX_AGENTS),
      pendingHires: ceo.proposals.length,
      message,
      history: ceo.chat,
    });
    apply(b, res, !!message);
  } catch (e) {
    st.setNotice(`CEO: ${(e as Error).message}`);
  } finally {
    useStore.getState().setCeoBusy(businessId, false);
  }
}

function apply(b: Business, res: CeoReply, chatted: boolean) {
  const st = useStore.getState();
  const id = b.id;
  if (chatted) st.ceoChat(id, 'ceo', res.reply);
  else st.ceoLog(id, res.reply);

  for (const d of res.delegations) {
    const t = st.tasks.find((x) => x.id === d.taskId);
    const a = st.agents.find((x) => x.id === d.agentId);
    if (!t || !a) continue;
    st.delegateTask(t.id, a.id);
    st.ceoLog(id, `Delegerade "${t.title.slice(0, 40)}" → ${a.name} (${d.reason})`);
  }

  const ceo = useStore.getState().ceo[id] ?? defaultCeo(st.businesses.indexOf(b));
  const fresh = res.hires.filter(
    (h) => !ceo.proposals.some((p) => p.stage === h.stage && p.name === h.name),
  );
  if (!fresh.length) return;
  const count = () => useStore.getState().agents.filter((a) => a.businessId === id).length;
  if (ceo.autoApprove) {
    for (const h of fresh) {
      if (count() >= Math.min(ceo.maxAgents, MAX_AGENTS)) break;
      useStore.getState().hireAgent(id, h.name, h.stage);
      useStore.getState().ceoLog(id, `Anställde ${h.name} i "${b.stages[h.stage]}" – ${h.rationale}`);
    }
  } else {
    st.addProposals(id, fresh);
    st.ceoLog(id, `Föreslår ${fresh.length} anställning(ar) – väntar på ditt godkännande`);
  }
}

/** Flaskhals: något steg har många väntande jobb per agent. */
function bottleneck(b: Business): boolean {
  const { agents, tasks } = useStore.getState();
  for (let s = 1; s < b.stages.length - 1; s++) {
    const waiting = tasks.filter((t) => t.businessId === b.id && t.stage === s && !t.assignee).length;
    const n = agents.filter((a) => a.businessId === b.id && a.stage === s).length;
    if (waiting >= 3 && waiting > n * 2) return true;
  }
  return false;
}

/** Delegering behövs bara när ett steg har flera agenter och odelegerade väntande jobb. */
function needsDelegation(b: Business): boolean {
  const { agents, tasks } = useStore.getState();
  for (let s = 1; s < b.stages.length - 1; s++) {
    const n = agents.filter((a) => a.businessId === b.id && a.stage === s).length;
    if (n < 2) continue;
    if (tasks.some((t) => t.businessId === b.id && t.stage === s && !t.assignee && !t.delegatedTo)) return true;
  }
  return false;
}

/** Anropas regelbundet: kostar bara ett Claude-anrop när det finns något att besluta om. */
export function ceoAutoTick() {
  const st = useStore.getState();
  if (!st.serverOnline || !(st.health?.anthropic || st.health?.mock)) return;
  for (const [i, b] of st.businesses.entries()) {
    const ceo = st.ceo[b.id] ?? defaultCeo(i);
    if (!ceo.auto || st.ceoBusy[b.id]) continue;
    if (Date.now() - (lastRun[b.id] ?? 0) < 60_000) continue;
    if (needsDelegation(b) || (ceo.proposals.length === 0 && bottleneck(b))) runCeo(b.id);
  }
}
