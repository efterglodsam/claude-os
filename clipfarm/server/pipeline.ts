import fs from 'node:fs';
import path from 'node:path';
import { findHighlights, reviewClip } from './claude.ts';
import { config } from './config.ts';
import { discordPostConfigured, postClip } from './discord.ts';
import { clipsDir, cutClip, fetchSource, parseSubs, transcriptText, transcribeWithWhisper, workDir } from './media.ts';
import { allJobs, getRoster, log, save } from './state.ts';
import type { ClipCandidate, Job, Segment } from './types.ts';

/**
 * Varje steg (1 Scout, 2 Editor, 3 QA+publicering) har lika många parallella arbetare som
 * agenter anställda i steget. Saknas agenter i ett steg används en virtuell standardagent.
 * Jobb som CEO delegerat till en viss agent går till den när den är ledig.
 */
const STAGES = [1, 2, 3];
const busy = new Set<string>();

export function enqueue(job: Job) {
  job.status = 'queued';
  job.error = undefined;
  save();
  pump();
}

function agentsFor(stage: number): string[] {
  const ids = getRoster().filter((a) => a.stage === stage).map((a) => a.id);
  return ids.length ? ids : [`default-${stage}`];
}

export function pump() {
  for (const stage of STAGES) {
    const queued = allJobs()
      .filter((j) => j.stage === stage && j.status === 'queued')
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const job of queued) {
      const free = agentsFor(stage).filter((id) => !busy.has(id));
      if (!free.length) break;
      const wanted = job.delegation?.[stage];
      // Delegerad agent har företräde, men en ledig agent får inte stå och vänta
      // på en upptagen kollega – då tar en annan över.
      const agentId = wanted && free.includes(wanted) ? wanted : free[0];
      runStep(job, stage, agentId);
    }
  }
}

function runStep(job: Job, stage: number, agentId: string) {
  busy.add(agentId);
  job.status = 'working';
  job.agentId = agentId;
  job.error = undefined;
  job.progress = 0;
  save();
  const step = stage === 1 ? scout : stage === 2 ? edit : qaAndPublish;
  step(job)
    .then(() => {
      job.agentId = undefined;
      job.progress = 0;
      job.stage = stage + 1;
      job.status = job.stage >= 4 ? 'done' : 'queued';
      if (job.status === 'done') job.progress = 1;
    })
    .catch((e) => {
      job.agentId = undefined;
      job.status = 'failed';
      job.error = e instanceof Error ? e.message : String(e);
      log(job, `FEL: ${job.error}`);
    })
    .finally(() => {
      busy.delete(agentId);
      save();
      pump();
    });
}

function loadSegments(job: Job): Segment[] {
  if (!job.transcriptFile) throw new Error('Transkript saknas – ta bort jobbet och lägg till det igen');
  return parseSubs(fs.readFileSync(job.transcriptFile, 'utf8'));
}

async function scout(job: Job) {
  log(job, 'Scout: hämtar video och undertexter…');
  const src = await fetchSource(job.id, job.url);
  job.sourceFile = src.video;
  job.title = src.title;
  let subs = src.subs;
  if (!subs) {
    log(job, 'Inga undertexter – försöker med whisper…');
    subs = await transcribeWithWhisper(src.video, workDir(job.id));
  }
  job.transcriptFile = subs;
  job.progress = 0.4;
  save();
  const segs = parseSubs(fs.readFileSync(subs, 'utf8'));
  if (!segs.length) throw new Error('Transkriptet blev tomt');
  const duration = segs[segs.length - 1].end;
  log(job, `Scout: ${segs.length} rader, ${(duration / 60).toFixed(0)} min. Frågar Claude efter höjdpunkter…`);
  const raw = await findHighlights(job.title, transcriptText(segs), duration);
  job.candidates = validate(raw, duration, job);
  if (!job.candidates.length) throw new Error('Scout hittade inga klipp som uppfyller längd-/regelkraven');
  log(job, `Scout: ${job.candidates.length} klipp valda`);
}

function validate(raw: ClipCandidate[], duration: number, job: Job): ClipCandidate[] {
  const ok: ClipCandidate[] = [];
  for (const c of [...raw].sort((a, b) => a.start - b.start)) {
    const len = c.end - c.start;
    if (c.start < 0 || c.end > duration + 1 || len < config.minClip || len > config.maxClip) {
      log(job, `Förkastar "${c.title}" (${len.toFixed(0)} s, kräver ${config.minClip}-${config.maxClip} s)`);
      continue;
    }
    if (ok.length && c.start < ok[ok.length - 1].end) continue;
    ok.push(c);
  }
  return ok.slice(0, config.maxClipsPerJob);
}

async function edit(job: Job) {
  if (!job.sourceFile) throw new Error('Källvideo saknas – ta bort jobbet och lägg till det igen');
  const segs = loadSegments(job);
  job.clips = [];
  const dir = clipsDir(job.id);
  for (const [i, c] of job.candidates.entries()) {
    log(job, `Editor: klipper ${i + 1}/${job.candidates.length} (${c.title})`);
    const file = await cutClip(job.sourceFile, segs, c.start, c.end, dir, `clip${i + 1}`);
    job.clips.push({ ...c, file });
    job.progress = (i + 1) / job.candidates.length;
    save();
  }
}

async function qaAndPublish(job: Job) {
  const segs = loadSegments(job);
  for (const [i, c] of job.clips.entries()) {
    if (!c.qa) {
      const text = segs.filter((s) => s.end > c.start && s.start < c.end).map((s) => s.text).join(' ');
      c.qa = await reviewClip(c, text);
      log(job, `QA: ${c.title} → ${c.qa.pass ? 'godkänt' : 'underkänt'} (${c.qa.notes.slice(0, 120)})`);
    }
    job.progress = ((i + 1) / job.clips.length) * 0.6;
    save();
  }
  const good = job.clips.filter((c) => c.qa?.pass);
  if (!good.length) throw new Error('QA underkände alla klipp – se noteringar i loggen');
  for (const [i, c] of good.entries()) {
    if (c.posted || !c.file) continue;
    c.posted = await postClip(c.file, `**${c.title}**\n${c.caption}\n_Källa: ${job.title}_`);
    job.progress = 0.6 + ((i + 1) / good.length) * 0.4;
    save();
  }
  log(job, discordPostConfigured() ? 'Publicerat i Discord' : `Klart – klippen ligger i ${path.relative(process.cwd(), clipsDir(job.id))} (Discord ej konfigurerat)`);
}
