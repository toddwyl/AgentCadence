import { describe, expect, it } from 'vitest';
import { safeToolMeta, TOOL_META } from '../pipeline.js';

describe('safeToolMeta', () => {
  it('returns correct meta for "cursor"', () => {
    const meta = safeToolMeta('cursor');
    expect(meta.displayName).toBe('Cursor');
    expect(meta.tintColor).toBe('#374151');
    expect(meta.defaultModels).toBeInstanceOf(Array);
    expect(meta.defaultModels.length).toBeGreaterThan(0);
  });

  it('returns correct meta for "claude"', () => {
    const meta = safeToolMeta('claude');
    expect(meta.displayName).toBe('Claude');
    expect(meta.tintColor).toBe('#f97316');
  });

  it('returns correct meta for "codex"', () => {
    const meta = safeToolMeta('codex');
    expect(meta.displayName).toBe('Codex');
    expect(meta.tintColor).toBe('#6366f1');
  });

  it('returns fallback (cursor) for undefined', () => {
    const meta = safeToolMeta(undefined);
    expect(meta).toEqual(TOOL_META.cursor);
  });

  it('returns fallback (cursor) for unknown string', () => {
    const meta = safeToolMeta('nonexistent-tool');
    expect(meta).toEqual(TOOL_META.cursor);
  });
});
