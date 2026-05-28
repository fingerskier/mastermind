export interface ParsedMemoryBlock {
  title: string;
  body: string;
  scope: 'private' | 'shared';
}

const BLOCK_RE = /<<MEMORY\b([^>]*)>>([\s\S]*?)<<\/MEMORY>>/g;
const TITLE_RE = /title="([^"]*)"/;
const ATTR_SCOPE_RE = /scope="([^"]*)"/;

export function parseMemoryBlocks(text: string): ParsedMemoryBlock[] {
  const out: ParsedMemoryBlock[] = [];
  let match: RegExpExecArray | null;
  BLOCK_RE.lastIndex = 0;
  while ((match = BLOCK_RE.exec(text)) !== null) {
    const attrs = match[1] ?? '';
    const titleMatch = TITLE_RE.exec(attrs);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    if (!title) continue;
    const body = match[2].replace(/^\n/, '').replace(/\s+$/, '');
    const scopeRaw = ATTR_SCOPE_RE.exec(attrs)?.[1]?.trim();
    const scope: 'private' | 'shared' = scopeRaw === 'shared' ? 'shared' : 'private';
    out.push({ title, body, scope });
  }
  return out;
}

export interface ParsedJobBlock {
  title: string;
  brief: string;
  councillor: string | null;
  priority: 'low' | 'normal' | 'high';
}

const JOB_BLOCK_RE = /<<JOB\b([^>]*)>>([\s\S]*?)<<\/JOB>>/g;
const ATTR_COUNCILLOR_RE = /councillor="([^"]*)"/;
const ATTR_PRIORITY_RE = /priority="([^"]*)"/;
const VALID_PRIORITY = new Set(['low', 'normal', 'high']);

export function parseJobBlocks(text: string): ParsedJobBlock[] {
  const out: ParsedJobBlock[] = [];
  let match: RegExpExecArray | null;
  JOB_BLOCK_RE.lastIndex = 0;
  while ((match = JOB_BLOCK_RE.exec(text)) !== null) {
    const attrs = match[1] ?? '';
    const titleMatch = TITLE_RE.exec(attrs);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    if (!title) continue;
    const brief = match[2].replace(/^\n/, '').replace(/\s+$/, '');
    const councillorRaw = ATTR_COUNCILLOR_RE.exec(attrs)?.[1]?.trim() ?? '';
    const councillor = councillorRaw === '' ? null : councillorRaw;
    const priorityRaw = ATTR_PRIORITY_RE.exec(attrs)?.[1]?.trim() ?? '';
    const priority = (VALID_PRIORITY.has(priorityRaw) ? priorityRaw : 'normal') as
      | 'low'
      | 'normal'
      | 'high';
    out.push({ title, brief, councillor, priority });
  }
  return out;
}

export interface ReflectionPromptInput {
  title: string;
  brief: string;
  transcript: string;
  output: string;
}

export function buildReflectionPrompt(input: ReflectionPromptInput): string {
  return [
    '# Reflection',
    '',
    'You just finished the job below. Decide whether anything from this run is worth remembering for next time — your future self will see retrieved memory entries before each new job, ranked by similarity to the new brief.',
    '',
    'Emit zero or more memory entries using this exact fenced format:',
    '',
    '<<MEMORY title="short slug-friendly title">>',
    'body markdown — include *why* this is worth remembering, not just what happened',
    '<</MEMORY>>',
    '',
    'If nothing is worth keeping, respond with no MEMORY blocks at all. Quality over quantity.',
    '',
    'You may also propose follow-up jobs (zero or more) using this format:',
    '',
    '<<JOB title="short slug-friendly title" councillor="optional-slug" priority="normal">>',
    'brief — what the job should accomplish and why',
    '<</JOB>>',
    '',
    '`councillor` is optional: omit to leave unassigned, or use "all" for a broadcast. Valid priorities: low, normal, high. Only propose jobs when there is a clear, scoped follow-up — not vague "could explore X" hand-waves.',
    '',
    `## Job title`,
    '',
    input.title,
    '',
    `## Brief`,
    '',
    input.brief.trim(),
    '',
    `## Transcript`,
    '',
    input.transcript.trim() || '(empty)',
    '',
    `## Output`,
    '',
    input.output.trim() || '(empty)',
    ''
  ].join('\n');
}
