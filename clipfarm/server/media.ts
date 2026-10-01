import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config, paths } from './config.ts';
import type { Segment } from './types.ts';

export function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: opts.cwd });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) =>
      reject(new Error((e as NodeJS.ErrnoException).code === 'ENOENT' ? `${cmd} är inte installerat (hittas inte i PATH)` : e.message)),
    );
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} misslyckades (${code}): ${err.slice(-600)}`))));
  });
}

export const workDir = (jobId: string) => path.join(paths.work, jobId);
export const clipsDir = (jobId: string) => path.join(paths.clips, jobId);

const isLocal = (url: string) => !/^https?:\/\//i.test(url) && fs.existsSync(url);

/** Hämtar video + undertexter. Lokal fil (med .srt/.vtt bredvid) stöds för test. */
export async function fetchSource(jobId: string, url: string) {
  const dir = workDir(jobId);
  fs.mkdirSync(dir, { recursive: true });
  if (isLocal(url)) {
    const base = url.replace(/\.[^.]+$/, '');
    const sub = ['.srt', '.vtt'].map((e) => base + e).find((f) => fs.existsSync(f));
    return { video: url, title: path.basename(url), subs: sub };
  }
  const info = JSON.parse(await run('yt-dlp', ['--no-playlist', '--dump-json', '--skip-download', url]));
  await run(
    'yt-dlp',
    [
      '--no-playlist',
      '-f', 'bv*[height<=1080]+ba/b[height<=1080]/b',
      '--merge-output-format', 'mp4',
      '--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,sv.*', '--sub-format', 'vtt',
      '-o', path.join(dir, 'source.%(ext)s'),
      url,
    ],
  );
  const files = fs.readdirSync(dir);
  const video = files.find((f) => f === 'source.mp4') ?? files.find((f) => /^source\.(mkv|webm|mp4)$/.test(f));
  if (!video) throw new Error('Hittade ingen nedladdad videofil');
  const sub = files.find((f) => /^source\..*\.(vtt|srt)$/.test(f));
  return { video: path.join(dir, video), title: String(info.title ?? url), subs: sub ? path.join(dir, sub) : undefined };
}

/** Whisper-fallback om videon saknar undertexter och `whisper` finns installerat. */
export async function transcribeWithWhisper(video: string, outDir: string): Promise<string> {
  await run('whisper', [video, '--model', process.env.WHISPER_MODEL ?? 'base', '--output_format', 'srt', '--output_dir', outDir]);
  const f = fs.readdirSync(outDir).find((x) => x.endsWith('.srt'));
  if (!f) throw new Error('whisper gav ingen transkribering');
  return path.join(outDir, f);
}

const ts = (s: string) => {
  const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
};

const clean = (t: string) =>
  t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/\s+/g, ' ').trim();

/** Parsar SRT/VTT till segment. Tar bort YouTubes "rullande" dubbletter. */
export function parseSubs(raw: string): Segment[] {
  const segs: Segment[] = [];
  for (const block of raw.replace(/\r/g, '').split(/\n\n+/)) {
    const lines = block.split('\n');
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) continue;
    const [a, b] = lines[i].split('-->');
    const textLines = lines.slice(i + 1).map(clean).filter(Boolean);
    if (!textLines.length) continue;
    segs.push({ start: ts(a), end: ts(b.trim().split(/\s+/)[0]), text: textLines[textLines.length - 1] });
  }
  const out: Segment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    if (prev && (prev.text === s.text || prev.text.endsWith(s.text))) {
      prev.end = Math.max(prev.end, s.end);
      continue;
    }
    out.push({ ...s });
  }
  return out;
}

export const fmt = (sec: number) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? h + ':' : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function transcriptText(segs: Segment[]): string {
  return segs.map((s) => `[${fmt(s.start)}] ${s.text}`).join('\n');
}

const srtTime = (t: number) => {
  const ms = Math.round(t * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
};

function writeSrt(file: string, segs: Segment[], start: number, end: number) {
  const rel = segs
    .filter((s) => s.end > start && s.start < end)
    .map((s) => ({ a: Math.max(0, s.start - start), b: Math.min(end, s.end) - start, text: s.text }));
  fs.writeFileSync(file, rel.map((s, i) => `${i + 1}\n${srtTime(s.a)} --> ${srtTime(s.b)}\n${s.text}\n`).join('\n'));
  return rel.length > 0;
}

/** Klipper ut [start,end], gör 9:16 om layout=vertical och bränner in undertexter. */
export async function cutClip(video: string, segs: Segment[], start: number, end: number, outDir: string, name: string) {
  fs.mkdirSync(outDir, { recursive: true });
  const srt = `${name}.srt`;
  const hasCaps = config.captions && writeSrt(path.join(outDir, srt), segs, start, end);
  const filters: string[] = [];
  if (config.layout === 'vertical') filters.push('crop=ih*9/16:ih', 'scale=1080:1920');
  if (hasCaps) {
    const size = config.layout === 'vertical' ? 16 : 20;
    filters.push(`subtitles=${srt}:force_style='FontSize=${size},Alignment=2,MarginV=${config.layout === 'vertical' ? 60 : 30},Outline=2,Bold=1'`);
  }
  const file = `${name}.mp4`;
  const args = ['-y', '-ss', String(start), '-i', path.resolve(video), '-t', String(end - start)];
  if (filters.length) args.push('-vf', filters.join(','));
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', file);
  await run('ffmpeg', args, { cwd: outDir });
  return path.join(outDir, file);
}
