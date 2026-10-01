import path from 'node:path';

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const ROOT = path.resolve(import.meta.dirname, '..');
export const DATA_DIR = path.resolve(process.env.CLIPFARM_DATA ?? path.join(ROOT, 'data'));

export const config = {
  port: num(process.env.PORT, 8787),
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  /** Sätt CLAUDE_MOCK=1 för att köra hela flödet utan Claude-anrop (test). */
  mock: process.env.CLAUDE_MOCK === '1',
  model: process.env.CLAUDE_MODEL ?? 'claude-opus-5-5',
  minClip: num(process.env.MIN_CLIP_SECONDS, 20),
  maxClip: num(process.env.MAX_CLIP_SECONDS, 90),
  maxClipsPerJob: num(process.env.MAX_CLIPS_PER_JOB, 5),
  layout: (process.env.CLIP_LAYOUT ?? 'vertical') as 'vertical' | 'original',
  captions: process.env.CLIP_CAPTIONS !== '0',
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    rulesChannelId: process.env.DISCORD_RULES_CHANNEL_ID,
    submitChannelId: process.env.DISCORD_SUBMIT_CHANNEL_ID,
    webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  },
  youtube: { apiKey: process.env.YOUTUBE_API_KEY, channelId: process.env.YOUTUBE_CHANNEL_ID },
  tiktok: { accessToken: process.env.TIKTOK_ACCESS_TOKEN },
  instagram: { accessToken: process.env.INSTAGRAM_ACCESS_TOKEN, userId: process.env.INSTAGRAM_USER_ID },
};

export const paths = {
  state: path.join(DATA_DIR, 'state.json'),
  rules: path.join(DATA_DIR, 'rules.md'),
  clips: path.join(DATA_DIR, 'clips'),
  work: path.join(DATA_DIR, 'work'),
};
