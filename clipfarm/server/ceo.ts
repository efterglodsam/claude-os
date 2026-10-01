import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.ts';
import { loadRules } from './rules.ts';

export interface CeoInput {
  business: { name: string; stages: string[]; live: boolean; unitLabel?: string };
  ceoName: string;
  agents: { id: string; name: string; stage: number; busy: boolean }[];
  tasks: { id: string; title: string; stage: number; running: boolean; delegatedTo?: string }[];
  maxAgents: number;
  pendingHires: number;
  message?: string;
  history?: { role: 'user' | 'ceo'; text: string }[];
}

export interface CeoOutput {
  reply: string;
  hires: { name: string; stage: number; rationale: string }[];
  delegations: { taskId: string; agentId: string; reason: string }[];
}

const schema = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'Kort svar/lägesrapport till ägaren, på svenska' },
    hires: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Rollnamn för den nya agenten, t.ex. "Editor 2"' },
          stage: { type: 'integer', description: 'Index på steget agenten ska jobba i' },
          rationale: { type: 'string' },
        },
        required: ['name', 'stage', 'rationale'],
        additionalProperties: false,
      },
    },
    delegations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          agentId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['taskId', 'agentId', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'hires', 'delegations'],
  additionalProperties: false,
} as const;

let client: Anthropic | undefined;

function describe(i: CeoInput): string {
  const st = i.business.stages;
  const lines = [
    `Business: ${i.business.name}`,
    `Flödessteg (index: namn): ${st.map((s, n) => `${n}: ${s}`).join(' | ')}`,
    `Steg 0 är inkorg (ägaren startar jobb därifrån) och sista steget är klart. Agenter jobbar i steg 1..${st.length - 2}.`,
    `Max antal agenter: ${i.maxAgents}. Anställningsförslag som redan väntar på ägarens godkännande: ${i.pendingHires}.`,
    '',
    'AGENTER:',
    ...(i.agents.length ? i.agents.map((a) => `- id=${a.id} namn="${a.name}" steg=${a.stage} (${st[a.stage]}) ${a.busy ? 'UPPTAGEN' : 'ledig'}`) : ['(inga)']),
    '',
    'JOBB (ej klara):',
    ...(i.tasks.length
      ? i.tasks.map((t) => `- id=${t.id} "${t.title}" steg=${t.stage} (${st[t.stage]}) ${t.running ? 'körs' : 'väntar'}${t.delegatedTo ? ` delegerat→${t.delegatedTo}` : ''}`)
      : ['(inga)']),
  ];
  return lines.join('\n');
}

function mock(i: CeoInput): CeoOutput {
  const hires: CeoOutput['hires'] = [];
  const delegations: CeoOutput['delegations'] = [];
  const load = new Map<string, number>();
  for (const t of i.tasks.filter((t) => !t.running && t.stage >= 1 && t.stage < i.business.stages.length - 1)) {
    const cands = i.agents.filter((a) => a.stage === t.stage);
    if (!cands.length) continue;
    cands.sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0));
    load.set(cands[0].id, (load.get(cands[0].id) ?? 0) + 1);
    if (t.delegatedTo !== cands[0].id) delegations.push({ taskId: t.id, agentId: cands[0].id, reason: 'mock: jämn fördelning' });
  }
  for (let s = 1; s < i.business.stages.length - 1; s++) {
    const waiting = i.tasks.filter((t) => t.stage === s && !t.running).length;
    const n = i.agents.filter((a) => a.stage === s).length;
    if (waiting >= 3 && n < 3 && i.agents.length + i.pendingHires < i.maxAgents && !hires.length) {
      hires.push({ name: `${i.business.stages[s]} ${n + 1}`, stage: s, rationale: `mock: ${waiting} jobb köar i "${i.business.stages[s]}"` });
    }
  }
  return { reply: `(mock) ${i.ceoName}: ${delegations.length} delegeringar, ${hires.length} anställningsförslag.`, hires, delegations };
}

export async function ceoDecide(i: CeoInput): Promise<CeoOutput> {
  const out = config.mock ? mock(i) : await askClaude(i);
  // Validera mot verkligheten – Claude får aldrig införa okända id:n eller steg.
  const stages = i.business.stages.length;
  const agentById = new Map(i.agents.map((a) => [a.id, a]));
  const taskById = new Map(i.tasks.map((t) => [t.id, t]));
  const hires = out.hires
    .filter((h) => Number.isInteger(h.stage) && h.stage >= 1 && h.stage <= stages - 2)
    .slice(0, Math.max(0, Math.min(2, i.maxAgents - i.agents.length - i.pendingHires)));
  const delegations = out.delegations.filter((d) => {
    const a = agentById.get(d.agentId);
    const t = taskById.get(d.taskId);
    return a && t && a.stage === t.stage && !t.running;
  });
  return { reply: out.reply, hires, delegations };
}

async function askClaude(i: CeoInput): Promise<CeoOutput> {
  if (!config.anthropicKey && !process.env.ANTHROPIC_AUTH_TOKEN) throw new Error('ANTHROPIC_API_KEY saknas (sätt den i clipfarm/.env)');
  client ??= new Anthropic();
  const system =
    `Du är ${i.ceoName}, CEO för businessen "${i.business.name}". Du leder ett team av AI-agenter och rapporterar till ägaren.\n` +
    `Dina uppgifter:\n` +
    `1. DELEGERA: för varje väntande jobb som ligger i ett agentsteg, välj vilken agent i just det steget som ska ta det (agentId måste vara en agent i samma steg som jobbet). Fördela jämnt, och lägg inte jobb på en upptagen agent om en ledig finns.\n` +
    `2. ANSTÄLL: föreslå nya agenter bara när det verkligen behövs – t.ex. när jobb köar i ett steg medan andra steg står tomma (flaskhals). Anställ aldrig "för säkerhets skull". Föreslå inget om taket för antal agenter är nått.\n` +
    `3. RAPPORTERA: svara ägaren kort och konkret på svenska. Om ägaren ställer en fråga eller ger en order, svara på den.\n` +
    `Du kan inte starta eller ta bort jobb – bara delegera och föreslå anställningar. Ägaren godkänner anställningar.` +
    (i.business.live ? `\n\nBusinessen följer ett clipping-communitys regler:\n=== REGLER ===\n${loadRules()}\n=== SLUT ===` : '');
  const messages: Anthropic.MessageParam[] = [
    ...(i.history ?? []).slice(-10).map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.text })),
    { role: 'user', content: `${describe(i)}\n\n${i.message ? `Ägarens meddelande: ${i.message}` : 'Gör din vanliga genomgång: delegera och föreslå ev. anställningar.'}` },
  ];
  // Historiken måste börja med en user-tur och alternera.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const stream = client.messages.stream({
    model: process.env.CEO_MODEL ?? config.model,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as unknown as Record<string, unknown> } },
    system,
    messages,
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude avböjde förfrågan (refusal)');
  const text = msg.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Tomt svar från CEO');
  return JSON.parse(text.text) as CeoOutput;
}
