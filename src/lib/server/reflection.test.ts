import { describe, expect, it } from 'vitest';
import { parseMemoryBlocks, buildReflectionPrompt } from './reflection';

describe('parseMemoryBlocks', () => {
  it('returns empty array when no blocks present', () => {
    expect(parseMemoryBlocks('just some text, no memories')).toEqual([]);
  });

  it('parses a single block', () => {
    const out = parseMemoryBlocks(
      'preamble\n<<MEMORY title="Cash on hand">>\nbody one\n<</MEMORY>>\ntrailer'
    );
    expect(out).toEqual([{ title: 'Cash on hand', body: 'body one' }]);
  });

  it('parses multiple blocks', () => {
    const out = parseMemoryBlocks(
      '<<MEMORY title="A">>\naaa\n<</MEMORY>>\n<<MEMORY title="B">>\nbbb\n<</MEMORY>>'
    );
    expect(out).toEqual([
      { title: 'A', body: 'aaa' },
      { title: 'B', body: 'bbb' }
    ]);
  });

  it('preserves multi-line bodies', () => {
    const out = parseMemoryBlocks('<<MEMORY title="X">>\nline 1\nline 2\nline 3\n<</MEMORY>>');
    expect(out[0].body).toBe('line 1\nline 2\nline 3');
  });

  it('skips blocks without a title attribute', () => {
    const out = parseMemoryBlocks('<<MEMORY>>\nbody\n<</MEMORY>>');
    expect(out).toEqual([]);
  });

  it('skips blocks with empty title', () => {
    const out = parseMemoryBlocks('<<MEMORY title="">>\nbody\n<</MEMORY>>');
    expect(out).toEqual([]);
  });

  it('trims trailing whitespace on body', () => {
    const out = parseMemoryBlocks('<<MEMORY title="X">>\nbody  \n\n<</MEMORY>>');
    expect(out[0].body).toBe('body');
  });
});

describe('buildReflectionPrompt', () => {
  it('includes transcript and output sections', () => {
    const p = buildReflectionPrompt({
      title: 'Investigate cash burn',
      brief: 'Look at last quarter',
      transcript: 'TRANSCRIPT_BODY',
      output: 'OUTPUT_BODY'
    });
    expect(p).toContain('Investigate cash burn');
    expect(p).toContain('TRANSCRIPT_BODY');
    expect(p).toContain('OUTPUT_BODY');
    expect(p).toContain('<<MEMORY title=');
  });
});
