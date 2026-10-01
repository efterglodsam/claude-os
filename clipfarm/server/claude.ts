import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.ts';
import { loadRules } from './rules.ts';
import type { ClipCandidate } from './types.ts';

let client: Anthropic | undefined;
const api = () => (client ??= new Anthropic());

function systemPrompt(role: string) {
  return [
    {
      type: 'text' as const,
      text:
        `Du är ${role} i ett clipping-team som klipper korta videoklipp ur långa avsnitt (podcast/intervju) åt ett clipping-community.\n` +
        `Följ communityts regler och kriterier nedan strikt. Om reglerna anger längd, format, förbjudet innehåll eller krav på titel/beskrivning ska de gå före allt annat.\n\n` +
        `=== COMMUNITYTS REGLER ===\n${loadRules()}\n=== SLUT PÅ REGLER ===`,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

async function askJson<T>(role: string, prompt: string, schema: Record<string, unknown>, effort: 'low' | 'medium' | 'high'): Promise<T> {
  if (!config.anthropicKey && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error('ANTHROPIC_API_KEY saknas (sätt den i clipfarm/.env)');
  }
  const stream = api().messages.stream({
    model: config.model,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { effort, format: { type: 'json_schema', schema } },
    system: systemPrompt(role),
    messages: [{ role: 'user', content: prompt }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude avböjde förfrågan (refusal)');
  if (msg.stop_reason === 'max_tokens') throw new Error('Claude-svaret avbröts (max_tokens)');
  const text = msg.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new Error('Tomt svar från Claude');
  return JSON.parse(text.text) as T;
}

const candidateSchema = {
  type: 'object',
  properties: {
    clips: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          start: { type: 'number', description: 'Starttid i sekunder' },
          end: { type: 'number', description: 'Sluttid i sekunder' },
          title: { type: 'string' },
          hook: { type: 'string', description: 'Första meningen/ögonblicket som får tittaren att stanna' },
          caption: { type: 'string', description: 'Beskrivning/caption med ev. hashtags enligt reglerna' },
          reason: { type: 'string', description: 'Varför klippet funkar och hur det följer reglerna' },
        },
        required: ['start', 'end', 'title', 'hook', 'caption', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['clips'],
  additionalProperties: false,
};

export async function findHighlights(videoTitle: string, transcript: string, durationHint: number): Promise<ClipCandidate[]> {
  if (config.mock) return mockCandidates(durationHint);
  const prompt =
    `Roll: Scout. Hitta de ${config.maxClipsPerJob} bästa klippen i avsnittet "${videoTitle}".\n` +
    `Krav: varje klipp ${config.minClip}-${config.maxClip} sekunder, börjar och slutar vid hela meningar, fungerar fristående och har stark hook de första 3 sekunderna. ` +
    `Använd tidsstämplarna i transkriptet (format [mm:ss] eller [h:mm:ss]); svara med sekunder. Klippen får inte överlappa. ` +
    `Hoppa över sådant som reglerna förbjuder. Ge färre klipp hellre än svaga eller regelvidriga.\n\n` +
    `TRANSKRIPT:\n${transcript}`;
  const res = await askJson<{ clips: ClipCandidate[] }>('Scout (hittar de bästa klippen)', prompt, candidateSchema, 'medium');
  return res.clips;
}

const reviewSchema = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    notes: { type: 'string', description: 'Kort motivering; vid underkänt: vilken regel som bryts' },
  },
  required: ['pass', 'notes'],
  additionalProperties: false,
};

export async function reviewClip(c: ClipCandidate, text: string): Promise<{ pass: boolean; notes: string }> {
  if (config.mock) return { pass: true, notes: 'mock-granskning' };
  const prompt =
    `Roll: QA. Granska detta klipp mot communityts regler och kvalitetskriterier. Underkänn om någon regel bryts, om det saknar hook, ` +
    `börjar/slutar mitt i en mening, eller inte fungerar fristående.\n\n` +
    `Titel: ${c.title}\nCaption: ${c.caption}\nLängd: ${(c.end - c.start).toFixed(0)} s\n\nTranskript för klippet:\n${text}`;
  return askJson('QA (granskar klipp mot reglerna)', prompt, reviewSchema, 'low');
}

function mockCandidates(duration: number): ClipCandidate[] {
  const len = Math.min(config.minClip + 5, Math.max(5, duration / 3));
  return [0, 1].map((i) => ({
    start: Math.floor(i * (len + 2)),
    end: Math.floor(i * (len + 2) + len),
    title: `Mock-klipp ${i + 1}`,
    hook: 'mock',
    caption: `Mock-klipp ${i + 1} #test`,
    reason: 'CLAUDE_MOCK=1 – inget riktigt Claude-anrop',
  }));
}
