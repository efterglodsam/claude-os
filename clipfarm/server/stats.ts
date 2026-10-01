import { config } from './config.ts';
import { discordStats } from './discord.ts';

export interface PlatformStats {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'discord';
  configured: boolean;
  metrics: Record<string, number | string>;
  error?: string;
  hint?: string;
}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body as any;
}

async function youtube(): Promise<Record<string, number>> {
  const { apiKey, channelId } = config.youtube;
  const j = await getJson(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelId}&key=${apiKey}`);
  const s = j.items?.[0]?.statistics;
  if (!s) throw new Error('Kanalen hittades inte (kontrollera YOUTUBE_CHANNEL_ID)');
  return { Visningar: +s.viewCount, Prenumeranter: +s.subscriberCount, Videor: +s.videoCount };
}

async function tiktok(): Promise<Record<string, number>> {
  const j = await getJson('https://open.tiktokapis.com/v2/user/info/?fields=follower_count,likes_count,video_count', {
    headers: { Authorization: `Bearer ${config.tiktok.accessToken}` },
  });
  if (j.error?.code && j.error.code !== 'ok') throw new Error(j.error.message ?? j.error.code);
  const u = j.data?.user;
  return { Följare: u?.follower_count ?? 0, Likes: u?.likes_count ?? 0, Videor: u?.video_count ?? 0 };
}

async function instagram(): Promise<Record<string, number>> {
  const { accessToken, userId } = config.instagram;
  const j = await getJson(`https://graph.facebook.com/v21.0/${userId}?fields=followers_count,media_count&access_token=${accessToken}`);
  return { Följare: j.followers_count ?? 0, Inlägg: j.media_count ?? 0 };
}

async function collect(
  platform: PlatformStats['platform'],
  configured: boolean,
  hint: string,
  fn: () => Promise<Record<string, number | string>>,
): Promise<PlatformStats> {
  if (!configured) return { platform, configured: false, metrics: {}, hint };
  try {
    return { platform, configured: true, metrics: await fn() };
  } catch (e) {
    return { platform, configured: true, metrics: {}, error: (e as Error).message };
  }
}

let cache: { at: number; data: PlatformStats[] } | undefined;

export async function getStats(): Promise<PlatformStats[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.data;
  const data = await Promise.all([
    collect('youtube', !!(config.youtube.apiKey && config.youtube.channelId), 'Sätt YOUTUBE_API_KEY och YOUTUBE_CHANNEL_ID', youtube),
    collect('tiktok', !!config.tiktok.accessToken, 'Sätt TIKTOK_ACCESS_TOKEN (kräver godkänd TikTok-app, scope user.info.stat)', tiktok),
    collect('instagram', !!(config.instagram.accessToken && config.instagram.userId), 'Sätt INSTAGRAM_ACCESS_TOKEN och INSTAGRAM_USER_ID (Instagram Graph API, business/creator-konto)', instagram),
    collect('discord', !!(config.discord.botToken && config.discord.guildId), 'Sätt DISCORD_BOT_TOKEN och DISCORD_GUILD_ID', discordStats),
  ]);
  cache = { at: Date.now(), data };
  return data;
}
