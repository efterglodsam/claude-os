export interface Business {
  id: string;
  name: string;
  color: string;
  /** Kolumner i pipelinen. Första = inkorg (Backlog), sista = klart. */
  stages: string[];
  unitLabel: string;
  unitsPerTask: number;
  revenuePerTask: number;
  done: number;
  units: number;
  revenue: number;
  /** Riktiga agenter via backend (server/) i stället för simulering. */
  live?: boolean;
}

export interface Agent {
  id: string;
  businessId: string;
  name: string;
  /** Agenten bearbetar jobb som ligger i detta steg och flyttar dem ett steg fram. */
  stage: number;
  speed: number;
  color: string;
  taskId?: string;
}

export interface Task {
  id: string;
  businessId: string;
  title: string;
  stage: number;
  progress: number;
  assignee?: string;
  error?: string;
  /** CEO:ns delegering – agent som ska ta jobbet i dess nuvarande steg. */
  delegatedTo?: string;
  queued?: boolean;
  clips?: { title: string; file: string }[];
}

export type Panel =
  | null
  | { type: 'kanban' }
  | { type: 'stats' }
  | { type: 'elevator' }
  | { type: 'addBusiness' }
  | { type: 'rules' }
  | { type: 'ceo' }
  | { type: 'agent'; id: string };

export interface Interactable {
  kind: 'whiteboard' | 'stats' | 'elevator' | 'desk' | 'ceo';
  id?: string;
  label: string;
  x: number;
  z: number;
  r: number;
}

export interface ServerJob {
  id: string;
  url: string;
  title: string;
  stage: number;
  status: 'queued' | 'working' | 'failed' | 'done';
  progress: number;
  error?: string;
  agentId?: string;
  delegation?: Record<string, string>;
  clips: { title: string; file?: string; qa?: { pass: boolean; notes: string } }[];
}

export interface Health {
  ok: boolean;
  mock: boolean;
  model: string;
  anthropic: boolean;
  ffmpeg: boolean;
  ytdlp: boolean;
  whisper: boolean;
  rulesSet: boolean;
  discordRules: boolean;
  discordPost: boolean;
}

export interface PlatformStats {
  platform: 'youtube' | 'tiktok' | 'instagram' | 'discord';
  configured: boolean;
  metrics: Record<string, number | string>;
  error?: string;
  hint?: string;
}

export interface HireProposal {
  id: string;
  name: string;
  stage: number;
  rationale: string;
}

export interface CeoState {
  name: string;
  /** CEO gör egna genomgångar när jobb köar. */
  auto: boolean;
  /** Anställ utan att fråga ägaren (inom maxAgents). */
  autoApprove: boolean;
  maxAgents: number;
  proposals: HireProposal[];
  chat: { role: 'user' | 'ceo'; text: string }[];
  log: { t: number; text: string }[];
}
