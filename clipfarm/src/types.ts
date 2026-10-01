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
}

export type Panel =
  | null
  | { type: 'kanban' }
  | { type: 'stats' }
  | { type: 'elevator' }
  | { type: 'addBusiness' }
  | { type: 'agent'; id: string };

export interface Interactable {
  kind: 'whiteboard' | 'stats' | 'elevator' | 'desk';
  id?: string;
  label: string;
  x: number;
  z: number;
  r: number;
}
