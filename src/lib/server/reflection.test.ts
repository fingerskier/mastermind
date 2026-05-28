import { describe, expect, it } from 'vitest';
import { parseMemoryBlocks, parseJobBlocks, buildReflectionPrompt } from './reflection';

describe('parseMemoryBlocks', () => {
  it('returns empty array when no blocks present', () => {
    expect(parseMemoryBlocks('just some text, no memories')).toEqual([]);
  });

  it('parses a single block', () => {
    const out = parseMemoryBlocks(
      'preamble\n<<MEMORY title="Cash on hand">>\nbody one\n<</MEMORY>>\ntrailer'
    );
    expect(out).toEqual([{ title: 'Cash on hand', body: 'body one', scope: 'private' }]);
  });

  it('parses multiple blocks', () => {
    const out = parseMemoryBlocks(
      '<<MEMORY title="A">>\naaa\n<</MEMORY>>\n<<MEMORY title="B">>\nbbb\n<</MEMORY>>'
    );
    expect(out).toEqual([
      { title: 'A', body: 'aaa', scope: 'private' },
      { title: 'B', body: 'bbb', scope: 'private' }
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

  it('defaults scope to "private" when attr is absent', () => {
    const out = parseMemoryBlocks('<<MEMORY title="A">>\nbody\n<</MEMORY>>');
    expect(out).toEqual([{ title: 'A', body: 'body', scope: 'private' }]);
  });

  it('returns scope "shared" when scope="shared"', () => {
    const out = parseMemoryBlocks(
      '<<MEMORY title="A" scope="shared">>\nbody\n<</MEMORY>>'
    );
    expect(out).toEqual([{ title: 'A', body: 'body', scope: 'shared' }]);
  });

  it('falls back to "private" for unknown scope values', () => {
    const out = parseMemoryBlocks(
      '<<MEMORY title="A" scope="team">>\nbody\n<</MEMORY>>'
    );
    expect(out[0].scope).toBe('private');
  });

  it('accepts scope in any attribute order', () => {
    const out = parseMemoryBlocks(
      '<<MEMORY scope="shared" title="A">>\nbody\n<</MEMORY>>'
    );
    expect(out[0]).toMatchObject({ title: 'A', scope: 'shared' });
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

  it('describes the <<JOB>> block format', () => {
    const p = buildReflectionPrompt({
      title: 't', brief: 'b', transcript: '', output: ''
    });
    expect(p).toContain('<<JOB title=');
    expect(p).toContain('<</JOB>>');
  });
});

describe('parseJobBlocks', () => {
  it('returns empty array when no JOB blocks present', () => {
    expect(parseJobBlocks('just prose')).toEqual([]);
  });

  it('parses a single block with title only', () => {
    const out = parseJobBlocks('<<JOB title="Follow up on cash">>\nbrief body\n<</JOB>>');
    expect(out).toEqual([
      { title: 'Follow up on cash', brief: 'brief body', councillor: null, priority: 'normal' }
    ]);
  });

  it('parses councillor and priority attributes', () => {
    const out = parseJobBlocks(
      '<<JOB title="X" councillor="cfo" priority="high">>\nbody\n<</JOB>>'
    );
    expect(out[0].councillor).toBe('cfo');
    expect(out[0].priority).toBe('high');
  });

  it('treats councillor="all" as broadcast (preserved as "all")', () => {
    const out = parseJobBlocks('<<JOB title="X" councillor="all">>\nbody\n<</JOB>>');
    expect(out[0].councillor).toBe('all');
  });

  it('skips blocks without a title', () => {
    expect(parseJobBlocks('<<JOB councillor="x">>\nbody\n<</JOB>>')).toEqual([]);
  });

  it('skips blocks with empty title', () => {
    expect(parseJobBlocks('<<JOB title="">>\nbody\n<</JOB>>')).toEqual([]);
  });

  it('defaults priority to "normal" when omitted', () => {
    const out = parseJobBlocks('<<JOB title="T">>\nb\n<</JOB>>');
    expect(out[0].priority).toBe('normal');
  });

  it('ignores invalid priority and falls back to "normal"', () => {
    const out = parseJobBlocks('<<JOB title="T" priority="urgent">>\nb\n<</JOB>>');
    expect(out[0].priority).toBe('normal');
  });

  it('parses multiple blocks mixed with MEMORY blocks', () => {
    const text = [
      '<<MEMORY title="M">>',
      'mbody',
      '<</MEMORY>>',
      '<<JOB title="J1">>',
      'jb1',
      '<</JOB>>',
      '<<JOB title="J2" councillor="cto">>',
      'jb2',
      '<</JOB>>'
    ].join('\n');
    expect(parseJobBlocks(text)).toEqual([
      { title: 'J1', brief: 'jb1', councillor: null, priority: 'normal' },
      { title: 'J2', brief: 'jb2', councillor: 'cto', priority: 'normal' }
    ]);
  });
});
