export interface ParsedMemoryBlock {
  title: string;
  body: string;
}

const BLOCK_RE = /<<MEMORY\b([^>]*)>>([\s\S]*?)<<\/MEMORY>>/g;
const TITLE_RE = /title="([^"]*)"/;

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
    out.push({ title, body });
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
