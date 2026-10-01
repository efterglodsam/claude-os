export interface Template {
  label: string;
  stages: string[];
  agents: string[];
  unitLabel: string;
  unitsPerTask: number;
  revenuePerTask: number;
  color: string;
  tasks: string[];
}

export const TEMPLATES: Record<string, Template> = {
  clipping: {
    label: 'Clipping (video)',
    stages: ['Backlog', 'Hitta klipp', 'Redigera', 'Granska', 'Publicerad'],
    agents: ['Scout', 'Editor', 'QA'],
    unitLabel: 'visningar',
    unitsPerTask: 4000,
    revenuePerTask: 15,
    color: '#38bdf8',
    tasks: ['Podcast #12 – bästa 60 s', 'Stream-highlight fredag', 'Intervju: vändpunkten', 'Gaming fail-compilation'],
  },
  pod: {
    label: 'POD (Print on Demand)',
    stages: ['Idéer', 'Design', 'Mockup', 'Listning', 'Live'],
    agents: ['Designer', 'Mockup-bot', 'Lister'],
    unitLabel: 'ordrar',
    unitsPerTask: 2,
    revenuePerTask: 80,
    color: '#f472b6',
    tasks: ['T-shirt: "Retro Sunset"', 'Mugg: kaffe-quote', 'Hoodie: minimal logo', 'Tote bag: katt-motiv'],
  },
  custom: {
    label: 'Egen business',
    stages: [],
    agents: [],
    unitLabel: 'enheter',
    unitsPerTask: 1,
    revenuePerTask: 50,
    color: '#a3e635',
    tasks: [],
  },
};

export const AGENT_COLORS = ['#f97316', '#22c55e', '#a78bfa', '#eab308', '#ef4444', '#14b8a6', '#ec4899', '#60a5fa'];
