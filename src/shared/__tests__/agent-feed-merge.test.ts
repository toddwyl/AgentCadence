import { describe, expect, it } from 'vitest';
import { applyAgentStreamEvent, buildAgentTranscriptDisplayItems, parseUnifiedDiff } from '../agent-feed-merge.js';
import type { AgentFeedItem, AgentStreamUiEvent } from '../types.js';

function reduce(events: AgentStreamUiEvent[]): AgentFeedItem[] {
  return events.reduce((feed, event) => applyAgentStreamEvent(feed, event), [] as AgentFeedItem[]);
}

describe('applyAgentStreamEvent', () => {
  it('builds a transcript flow with reasoning, assistant, tool result, todo, and turn result', () => {
    const feed = reduce([
      { kind: 'session_init', model: 'claude', cwd: '/tmp/demo' },
      { kind: 'reasoning_delta', text: 'Planning next step' },
      { kind: 'assistant_delta', text: 'Checking the repository.' },
      {
        kind: 'tool_call',
        phase: 'started',
        toolName: 'read_file',
        summary: 'read_file · src/app.ts',
        detail: 'src/app.ts',
        callId: 'tool-1',
      },
      {
        kind: 'tool_result',
        toolName: 'read_file',
        summary: 'read_file · src/app.ts',
        detail: 'src/app.ts',
        callId: 'tool-1',
        resultPreview: 'file contents',
        ok: true,
      },
      {
        kind: 'todo_snapshot',
        items: [{ id: '1', content: 'Ship transcript UI', status: 'in_progress' }],
      },
      { kind: 'turn_result', ok: true, durationMs: 1200 },
    ]);

    expect(feed).toEqual([
      { kind: 'session', model: 'claude', cwd: '/tmp/demo' },
      {
        kind: 'reasoning',
        text: 'Planning next step',
        summary: 'Planning next step',
        status: 'completed',
      },
      { kind: 'assistant', text: 'Checking the repository.' },
      {
        kind: 'tool_call',
        status: 'completed',
        toolName: 'read_file',
        summary: 'read_file · src/app.ts',
        detail: 'src/app.ts',
        callId: 'tool-1',
        resultPreview: 'file contents',
        ok: true,
      },
      {
        kind: 'todo',
        items: [{ id: '1', content: 'Ship transcript UI', status: 'in_progress' }],
      },
      { kind: 'turn_result', ok: true, durationMs: 1200 },
    ]);
  });

  it('merges command lifecycle into a single transcript item', () => {
    const feed = reduce([
      {
        kind: 'command',
        phase: 'started',
        summary: 'echo hello',
        command: 'echo hello',
        callId: 'cmd-1',
      },
      {
        kind: 'command',
        phase: 'completed',
        summary: 'echo hello · hello',
        command: 'echo hello',
        callId: 'cmd-1',
        resultPreview: 'hello',
        durationMs: 12,
        exitCode: 0,
        ok: true,
      },
    ]);

    expect(feed).toEqual([
      expect.objectContaining({
        kind: 'command',
        status: 'completed',
        summary: 'echo hello · hello',
        command: 'echo hello',
        callId: 'cmd-1',
        resultPreview: 'hello',
        durationMs: 12,
        exitCode: 0,
        ok: true,
        commandActions: [{ type: 'unknown', command: 'echo hello' }],
      }),
    ]);
  });

  it('keeps legacy tool events compatible with transcript items', () => {
    const feed = reduce([
      {
        kind: 'tool',
        phase: 'started',
        summary: 'shell · ls',
        toolName: 'shell',
        detail: 'ls',
        callId: 'legacy-shell',
      },
      {
        kind: 'tool',
        phase: 'completed',
        summary: 'shell · ls',
        toolName: 'shell',
        detail: 'ls',
        callId: 'legacy-shell',
        resultPreview: 'a.txt',
        ok: true,
      },
    ]);

    expect(feed).toEqual([
      expect.objectContaining({
        kind: 'command',
        status: 'completed',
        summary: 'shell · ls',
        command: 'ls',
        callId: 'legacy-shell',
        resultPreview: 'a.txt',
        ok: true,
        commandActions: [{ type: 'list_files', command: 'ls', path: 'ls' }],
      }),
    ]);
  });

  it('collapses low-value activity into a grouped display item without hiding code changes', () => {
    const display = buildAgentTranscriptDisplayItems([
      {
        kind: 'command',
        status: 'completed',
        summary: 'rg --files src',
        command: 'rg --files src',
      },
      {
        kind: 'tool_call',
        status: 'completed',
        summary: 'read_file · src/app.ts',
        toolName: 'read_file',
        detail: 'src/app.ts',
        resultPreview: 'const app = true;',
      },
      {
        kind: 'tool_call',
        status: 'completed',
        summary: 'edit_file · src/app.ts',
        toolName: 'edit_file',
        detail: 'src/app.ts',
        gitDiffUnified:
          'diff --git a/src/app.ts b/src/app.ts\nindex 111..222 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-console.log("old")\n+console.log("new")',
      },
    ] satisfies AgentFeedItem[]);

    expect(display[0]).toMatchObject({
      kind: 'activity_group',
      summary: 'Explored 1 file, 1 listing',
    });
    expect(display[1]).toMatchObject({
      kind: 'tool_call',
      toolName: 'edit_file',
      display: { importance: 'primary' },
    });
    expect(display[2]).toMatchObject({
      kind: 'file_change',
      path: 'src/app.ts',
    });
  });

  it('parses unified diff rows with explicit added and removed lines', () => {
    const files = parseUnifiedDiff(
      'diff --git a/src/app.ts b/src/app.ts\nindex 111..222 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1,2 +1,2 @@\n-console.log("old")\n+console.log("new")\n export {}'
    );

    expect(files).toHaveLength(1);
    expect(files[0]?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'removed', text: 'console.log("old")', oldLineNumber: 1 }),
        expect.objectContaining({ kind: 'added', text: 'console.log("new")', newLineNumber: 1 }),
        expect.objectContaining({ kind: 'context', text: 'export {}' }),
      ])
    );
  });

  it('coalesces consecutive read commands across multiple calls into one activity group', () => {
    const display = buildAgentTranscriptDisplayItems([
      {
        kind: 'command',
        status: 'completed',
        summary: 'sed -n "1,120p" src/alpha.ts',
        command: '/bin/zsh -lc \'sed -n "1,120p" src/alpha.ts\'',
      },
      {
        kind: 'command',
        status: 'completed',
        summary: 'cat src/beta.ts',
        command: '/bin/zsh -lc \'cat src/beta.ts\'',
      },
      {
        kind: 'command',
        status: 'completed',
        summary: 'rg "buildAgentTranscriptDisplayItems" src',
        command: '/bin/zsh -lc \'rg "buildAgentTranscriptDisplayItems" src\'',
      },
    ] satisfies AgentFeedItem[]);

    expect(display[0]).toMatchObject({
      kind: 'activity_group',
      summary: 'Explored 2 files, 1 search',
      entries: expect.arrayContaining([
        'Read alpha.ts',
        'Read beta.ts',
        'Search buildAgentTranscriptDisplayItems in src',
      ]),
    });
  });
});
