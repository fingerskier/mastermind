import { MEETING_TURN_NUDGE } from './config';

/**
 * Build the "Speak now" instruction that closes a turn prompt. When a brevity
 * nudge is set (default `MEETING_TURN_NUDGE`), it is appended so councillors
 * keep meeting responses short. Used by both local and remote turn paths.
 */
export function buildSpeakerInstruction(slug: string, nudge: string = MEETING_TURN_NUDGE): string {
  const base = `You are ${slug}. Speak now.`;
  return nudge.trim() ? `${base} ${nudge.trim()}` : base;
}

export interface ComposeTurnPromptParts {
  persona: string;
  memCtx: string;
  title: string;
  topic: string;
  summary: string;
  recentTurns: string[];
  speakerInstruction: string;
}

/** Build a meeting turn prompt from resolved parts. Mirrors meeting-runner.buildTurnPrompt. */
export function composeRemoteTurnPrompt(parts: ComposeTurnPromptParts): string {
  const sections: string[] = [];
  if (parts.persona.trim()) sections.push(`# Persona\n\n${parts.persona.trim()}`);
  if (parts.memCtx.trim()) sections.push(parts.memCtx);
  const recent = parts.recentTurns.join('\n\n');
  sections.push(
    [
      `# Meeting: ${parts.title}`,
      '',
      `## Topic`,
      '',
      parts.topic.trim() || '(no topic)',
      '',
      parts.summary.trim() ? `## Summary of earlier turns\n\n${parts.summary.trim()}\n` : '',
      `## Recent turns`,
      '',
      recent.trim() || '(no turns yet)',
      '',
      parts.speakerInstruction
    ].join('\n')
  );
  return sections.join('\n\n') + '\n';
}
