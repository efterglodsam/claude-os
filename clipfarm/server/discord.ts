import fs from 'node:fs';
import { config } from './config.ts';

const API = 'https://discord.com/api/v10';
const auth = () => ({ Authorization: `Bot ${config.discord.botToken}` });
const MAX_UPLOAD = 24 * 1024 * 1024;

export const discordRulesConfigured = () => !!(config.discord.botToken && config.discord.rulesChannelId);
export const discordPostConfigured = () => !!(config.discord.webhookUrl || (config.discord.botToken && config.discord.submitChannelId));

/**
 * Hämtar regelkanalens meddelanden (kräver en bot som du själv har lagt till i servern
 * och med Message Content Intent påslagen). Returnerar markdown.
 */
export async function fetchRulesFromDiscord(): Promise<string> {
  const { rulesChannelId } = config.discord;
  const res = await fetch(`${API}/channels/${rulesChannelId}/messages?limit=100`, { headers: auth() });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const msgs = (await res.json()) as { content: string; embeds?: { title?: string; description?: string }[] }[];
  const parts = msgs
    .reverse()
    .map((m) => [m.content, ...(m.embeds ?? []).map((e) => [e.title, e.description].filter(Boolean).join('\n'))].filter(Boolean).join('\n'))
    .filter(Boolean);
  if (!parts.length) throw new Error('Inga meddelanden med text hittades (är Message Content Intent påslagen?)');
  return `# Regler (synkade från Discord ${new Date().toISOString().slice(0, 10)})\n\n${parts.join('\n\n---\n\n')}\n`;
}

/** Postar ett färdigt klipp i din Discord (webhook eller bot). Returnerar true om det postades. */
export async function postClip(file: string, content: string): Promise<boolean> {
  if (!discordPostConfigured()) return false;
  const form = new FormData();
  const small = fs.statSync(file).size <= MAX_UPLOAD;
  const text = small ? content : `${content}\n(Filen är för stor för Discord – ligger på servern: ${file})`;
  form.append('payload_json', JSON.stringify({ content: text.slice(0, 1900) }));
  if (small) form.append('files[0]', await fs.openAsBlob(file), file.split('/').pop());
  const url = config.discord.webhookUrl ?? `${API}/channels/${config.discord.submitChannelId}/messages`;
  const res = await fetch(url, { method: 'POST', body: form, headers: config.discord.webhookUrl ? {} : auth() });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}

export async function discordStats() {
  if (!config.discord.botToken || !config.discord.guildId) throw new Error('DISCORD_BOT_TOKEN och DISCORD_GUILD_ID krävs');
  const res = await fetch(`${API}/guilds/${config.discord.guildId}?with_counts=true`, { headers: auth() });
  if (!res.ok) throw new Error(`Discord ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const g = (await res.json()) as { name: string; approximate_member_count?: number; approximate_presence_count?: number };
  return { Server: g.name, Medlemmar: g.approximate_member_count ?? 0, Online: g.approximate_presence_count ?? 0 };
}
