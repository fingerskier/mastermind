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
