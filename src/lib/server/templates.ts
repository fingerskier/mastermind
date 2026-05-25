import type { Job, Councillor, MemoryNote } from '$lib/types';

// ---------- schema ----------

export interface CouncilTemplate {
  format_version: 1;
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  council: {
    name: string;
    description?: string;
  };
  councillors: TemplateCouncillor[];
  memory?: TemplateMemoryNote[];
  sample_jobs?: TemplateSampleJob[];
}

export interface TemplateCouncillor {
  slug?: string;
  name: string;
  role: string;
  routing_hint?: string;
  adapter: string;
  persona: string;
  reflect?: boolean;
}

export interface TemplateMemoryNote {
  title: string;
  body: string;
}

export interface TemplateSampleJob {
  title: string;
  brief: string;
  councillor_slug: string;
}

// ---------- apply plan ----------

export interface ApplyPlan {
  council: { exists: boolean; willOverwrite: boolean };
  councillors: { add: string[]; overwrite: string[] };
  memory: { add: string[]; overwrite: string[] };
  sample_jobs: { add: number; skipped_because_jobs_exist: boolean };
}

// ---------- errors ----------

export class TemplateFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateFetchError';
  }
}

export class TemplateParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateParseError';
  }
}

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateValidationError';
  }
}

export class TemplateNeedsConfirmation extends Error {
  constructor(public plan: ApplyPlan) {
    super('Confirmation required for overwrite');
    this.name = 'TemplateNeedsConfirmation';
  }
}
