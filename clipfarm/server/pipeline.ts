import fs from 'node:fs';
import path from 'node:path';
import { findHighlights, reviewClip } from './claude.ts';
import { config } from './config.ts';
import { discordPostConfigured, postClip } from './discord.ts';
import { clipsDir, cutClip, fetchSource, parseSubs, transcriptText, transcribeWithWhisper, workDir } from './media.ts';
import { allJobs, getJob, log, save } from './state.ts';
import type { ClipCandidate, Job, Segment } from './types.ts';

const queue: string[] = [];
let running = 0;

export function enqueue(job: Job) {
  job.status = 'queued';
  job.error = undefined;
  if (!queue.includes(job.id)) queue.push(job.id);
  save();
  pump();
}

function pump() {
  while (running < config.maxConcurrent && queue.length) {
    const job = getJob(queue.shift()!);
    if (!job || job.status !== 'queued') continue;
    running++;
    runJob(job)
      .catch((e) => {
        job.status = 'failed';
        job.error = e instanceof Error ? e.message : String(e);
        log(job, `FEL: ${job.error}`);
      })
      .finally(() => {
        running--;
        save();
        pump();
      });
  }
}

export const activeCount = () => allJobs().filter((j) => j.status === 'working').length;

function loadSegments(job: Job): Segment[] {
  if (!job.transcriptFile) throw new Error('Transkript saknas – kör om från "Hitta klipp"');
  return parseSubs(fs.readFileSync(job.transcriptFile, 'utf8'));
}

function setStage(job: Job, stage: number) {
  job.stage = stage;
  job.progress = 0;
  save();
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
  const segs = parseSubs(fs.readFileSync(subs, 'utf8'));
  if (!segs.length) throw new Error('Transkriptet blev tomt');
  const duration = segs[segs.length - 1].end;
  log(job, `Scout: ${segs.length} rader, ${(duration / 60).toFixed(0)} min. Frågar Claude efter höjdpunkter…`);
  const raw = await findHighlights(job.title, transcriptText(segs), duration);
  job.candidates = validate(raw, duration, job);
  if (!job.candidates.length) throw new Error('Scout hittade inga klipp som uppfyller längd-/regelkraven');
  log(job, `Scout: ${job.candidates.length} klipp valda`);
  setStage(job, 2);
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
  if (!job.sourceFile) throw new Error('Källvideo saknas – kör om från "Hitta klipp"');
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
  setStage(job, 3);
}

async function qa(job: Job) {
  const segs = loadSegments(job);
  for (const [i, c] of job.clips.entries()) {
    const text = segs.filter((s) => s.end > c.start && s.start < c.end).map((s) => s.text).join(' ');
    c.qa = await reviewClip(c, text);
    log(job, `QA: ${c.title} → ${c.qa.pass ? 'godkänt' : 'underkänt'} (${c.qa.notes.slice(0, 120)})`);
    job.progress = (i + 1) / job.clips.length;
    save();
  }
  if (!job.clips.some((c) => c.qa?.pass)) throw new Error('QA underkände alla klipp – se noteringar i loggen');
  setStage(job, 4);
}

async function publish(job: Job) {
  const good = job.clips.filter((c) => c.qa?.pass);
  for (const [i, c] of good.entries()) {
    if (c.posted || !c.file) continue;
    const posted = await postClip(c.file, `**${c.title}**\n${c.caption}\n_Källa: ${job.title}_`);
    c.posted = posted;
    job.progress = (i + 1) / good.length;
    save();
  }
  log(job, discordPostConfigured() ? 'Publicerat i Discord' : `Klart – klippen ligger i ${path.relative(process.cwd(), clipsDir(job.id))} (Discord ej konfigurerat)`);
}

async function runJob(job: Job) {
  job.status = 'working';
  job.error = undefined;
  save();
  if (job.stage <= 1) await scout(job);
  if (job.stage === 2) await edit(job);
  if (job.stage === 3) await qa(job);
  if (job.stage === 4) await publish(job);
  job.progress = 1;
  job.status = 'done';
  save();
}
