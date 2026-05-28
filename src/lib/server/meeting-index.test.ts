import { describe, it, expect } from 'vitest';
import type { ChunkKind } from './embeddings';

describe('meeting chunk kinds', () => {
  it('exports meeting_topic | meeting_turn | meeting_summary | meeting_synthesis', () => {
    const accepted: ChunkKind[] = ['meeting_topic', 'meeting_turn', 'meeting_summary', 'meeting_synthesis'];
    for (const k of accepted) {
      const x: ChunkKind = k;
      void x;
      expect(typeof k).toBe('string');
    }
  });
});
