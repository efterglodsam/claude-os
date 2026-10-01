export interface ClipCandidate {
  start: number;
  end: number;
  title: string;
  hook: string;
  caption: string;
  reason: string;
}

export interface ClipResult extends ClipCandidate {
  file?: string;
  qa?: { pass: boolean; notes: string };
  posted?: boolean;
}

export type JobStatus = 'queued' | 'working' | 'failed' | 'done';

/** stage: 0 Backlog, 1 Hitta klipp (Scout), 2 Redigera (Editor), 3 Granska (QA), 4 Publicerad */
export interface Job {
  id: string;
  url: string;
  title: string;
  stage: number;
  status: JobStatus;
  progress: number;
  error?: string;
  createdAt: number;
  sourceFile?: string;
  transcriptFile?: string;
  candidates: ClipCandidate[];
  clips: ClipResult[];
  log: string[];
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}
