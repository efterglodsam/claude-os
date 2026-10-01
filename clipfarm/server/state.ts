import fs from 'node:fs';
import path from 'node:path';
import { paths } from './config.ts';
import type { Job } from './types.ts';

let jobs: Job[] = [];

export function loadState() {
  try {
    jobs = JSON.parse(fs.readFileSync(paths.state, 'utf8')).jobs ?? [];
    // Jobb som avbröts av en omstart: markera som misslyckade så de kan köras om.
    for (const j of jobs) {
      if (j.status === 'working') {
        j.status = 'failed';
        j.error = 'Servern startades om under körning – tryck "Försök igen".';
      }
    }
  } catch {
    jobs = [];
  }
}

export function save() {
  fs.mkdirSync(path.dirname(paths.state), { recursive: true });
  fs.writeFileSync(paths.state, JSON.stringify({ jobs }, null, 2));
}

export const allJobs = () => jobs;
export const getJob = (id: string) => jobs.find((j) => j.id === id);

export function createJob(url: string): Job {
  const job: Job = {
    id: Math.random().toString(36).slice(2, 9),
    url,
    title: url,
    stage: 0,
    status: 'queued',
    progress: 0,
    createdAt: Date.now(),
    candidates: [],
    clips: [],
    log: [],
  };
  jobs.push(job);
  save();
  return job;
}

export function removeJob(id: string) {
  jobs = jobs.filter((j) => j.id !== id);
  save();
}

export function log(job: Job, msg: string) {
  job.log.push(`${new Date().toISOString().slice(11, 19)} ${msg}`);
  if (job.log.length > 200) job.log.shift();
  console.log(`[${job.id}] ${msg}`);
}
