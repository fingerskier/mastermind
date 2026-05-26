export interface Council {
  slug: string;
  name: string;
  description: string;
  template: string | null;
  created_at: string;
}

export interface Councillor {
  slug: string;
  name: string;
  role: string;
  routing_hint: string;
  adapter: string;
  persona: string;
  reflect: boolean;
  created_at: string;
}

export interface CouncilWithCouncillors extends Council {
  councillors: Councillor[];
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  title: string;
  brief: string;
  councillor_slug: string;
  status: JobStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  exit_code: number | null;
  error: string | null;
  memory_slugs?: string[];
  reflection_error?: string;
  spawned_by_schedule_id?: string | null;
}

export interface JobEvent {
  at: string;
  type:
    | 'created'
    | 'started'
    | 'stdout'
    | 'stderr'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'note'
    | 'reflected'
    | 'reflection_failed'
    | 'proposed_job';
  message?: string;
}

export type JobProposalStatus = 'pending' | 'approved' | 'rejected';

export interface JobProposal {
  id: string;
  kind: 'job';
  proposed_by: string;
  source_job_id: string;
  title: string;
  brief: string;
  target_councillor: string | null;
  priority: 'low' | 'normal' | 'high';
  status: JobProposalStatus;
  created_at: string;
  decided_at?: string;
  decided_by?: 'user';
  reason?: string;
  resulting_job_ids?: string[];
}

export interface MemoryNote {
  slug: string;
  title: string;
  body: string;
  updated_at: string;
}

export type ScheduleKind = 'once' | 'recurring';

export interface Schedule {
  id: string;
  title: string;
  brief: string;
  councillor_slug: string;
  kind: ScheduleKind;
  fire_at: string | null;
  cron: string | null;
  enabled: boolean;
  next_fire_at: string | null;
  last_fire_job_id: string | null;
  fire_count: number;
  fired_at: string | null;
  created_at: string;
}

export type ScheduleEventType =
  | 'created'
  | 'enabled'
  | 'disabled'
  | 'edited'
  | 'fired'
  | 'skipped_overlap'
  | 'missed_fires'
  | 'fire_error';

export interface ScheduleEvent {
  at: string;
  type: ScheduleEventType;
  message?: string;
  job_id?: string;
  prior_job_id?: string;
  from?: string;
  to?: string | null;
  count?: number;
}
