import express from 'express';
import { config, paths } from './config.ts';
import { fetchRulesFromDiscord, discordPostConfigured, discordRulesConfigured } from './discord.ts';
import { run } from './media.ts';
import { enqueue } from './pipeline.ts';
import { loadRules, rulesAreSet, saveRules } from './rules.ts';
import { allJobs, createJob, getJob, loadState, removeJob, save } from './state.ts';
import { getStats } from './stats.ts';

loadState();
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use('/clips', express.static(paths.clips));

const probe = (cmd: string, args: string[]) => run(cmd, args).then(() => true, () => false);

app.get('/api/health', async (_req, res) => {
  const [ffmpeg, ytdlp, whisper] = await Promise.all([
    probe('ffmpeg', ['-version']),
    probe('yt-dlp', ['--version']),
    probe('whisper', ['--help']),
  ]);
  res.json({
    ok: true,
    mock: config.mock,
    model: config.model,
    anthropic: !!(config.anthropicKey || process.env.ANTHROPIC_AUTH_TOKEN),
    ffmpeg,
    ytdlp,
    whisper,
    rulesSet: rulesAreSet(),
    discordRules: discordRulesConfigured(),
    discordPost: discordPostConfigured(),
  });
});

app.get('/api/jobs', (_req, res) => res.json(allJobs()));

app.post('/api/jobs', (req, res) => {
  const url = String(req.body?.url ?? '').trim();
  if (!url) return res.status(400).json({ error: 'url krävs' });
  res.json(createJob(url));
});

function start(id: string): string | null {
  const job = getJob(id);
  if (!job) return 'Jobbet finns inte';
  if (job.stage !== 0 || job.status === 'working') return null;
  if (!config.mock && !rulesAreSet()) return 'Fyll i communityts regler först (🗒 Regler i Statistik-panelen) – agenterna måste ha dem.';
  job.stage = 1;
  enqueue(job);
  return null;
}

app.post('/api/jobs/start-all', (_req, res) => {
  const err = allJobs().filter((j) => j.stage === 0).map((j) => start(j.id)).find(Boolean);
  err ? res.status(409).json({ error: err }) : res.json({ ok: true });
});
app.post('/api/jobs/:id/start', (req, res) => {
  const err = start(req.params.id);
  err ? res.status(409).json({ error: err }) : res.json({ ok: true });
});
app.post('/api/jobs/:id/retry', (req, res) => {
  const job = getJob(req.params.id);
  if (!job || job.status !== 'failed') return res.status(409).json({ error: 'Bara misslyckade jobb kan köras om' });
  if (job.stage === 0) job.stage = 1;
  enqueue(job);
  res.json({ ok: true });
});
app.delete('/api/jobs/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (job?.status === 'working') return res.status(409).json({ error: 'Jobbet körs just nu' });
  removeJob(req.params.id);
  res.json({ ok: true });
});

app.get('/api/rules', (_req, res) => res.json({ text: loadRules(), set: rulesAreSet() }));
app.put('/api/rules', (req, res) => {
  saveRules(String(req.body?.text ?? ''));
  res.json({ ok: true, set: rulesAreSet() });
});
app.post('/api/rules/sync', async (_req, res) => {
  if (!discordRulesConfigured()) return res.status(409).json({ error: 'Sätt DISCORD_BOT_TOKEN och DISCORD_RULES_CHANNEL_ID' });
  try {
    const text = await fetchRulesFromDiscord();
    saveRules(text);
    res.json({ ok: true, text });
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

app.get('/api/stats', async (_req, res) => res.json(await getStats()));

app.listen(config.port, () => {
  save();
  console.log(`Clipfarm-server på http://localhost:${config.port}  (modell: ${config.model}${config.mock ? ', MOCK' : ''})`);
});
