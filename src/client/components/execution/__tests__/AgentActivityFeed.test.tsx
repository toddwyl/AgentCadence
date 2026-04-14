import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AgentFeedItem } from '@shared/types';
import { AgentActivityFeed } from '../AgentActivityFeed.js';

const labels = {
  thinking: 'Thinking',
  tool: 'Tool',
  session: 'Session',
  completed: 'Completed',
  failed: 'Failed',
  toolPhaseRunning: 'Running',
  toolPhaseDone: 'Done',
  toolResult: 'Result',
  toolGitDiff: 'Git diff',
  todoTitle: 'Tasks',
  transcriptAll: 'All activity',
  transcriptChanges: 'Code changes',
  changedFilesTitle: 'Code changes',
  filesChangedCount: '{count} files changed',
  showMore: 'Show more',
  showLess: 'Show less',
  omittedLines: '+{count} more lines',
};

describe('AgentActivityFeed', () => {
  it('renders transcript-style sections for quiet activity, code changes, todos, and run results', () => {
    const items: AgentFeedItem[] = [
      { kind: 'session', model: 'codex', cwd: '/tmp/project' },
      {
        kind: 'reasoning',
        text: 'Investigating the current implementation',
        summary: 'Investigating the current implementation',
        status: 'running',
      },
      { kind: 'assistant', text: 'I am checking the current implementation.' },
      { kind: 'assistant', text: 'I am reviewing the diff preview.' },
      {
        kind: 'command',
        status: 'completed',
        summary: 'sed -n "1,120p" src/index.ts',
        command: '/bin/zsh -lc \'sed -n "1,120p" src/index.ts\'',
        callId: 'cmd-1',
        resultPreview: 'console.log("old")',
      },
      {
        kind: 'tool_call',
        status: 'completed',
        summary: 'read_file · src/index.ts',
        toolName: 'read_file',
        detail: 'src/index.ts',
        callId: 'tool-1',
        resultPreview: 'console.log("old")',
      },
      {
        kind: 'file_change',
        path: 'src/index.ts',
        summary: 'Changed src/index.ts',
        gitDiffUnified: 'diff --git a/src/index.ts b/src/index.ts\n@@ -1 +1 @@\n-console.log("old")\n+console.log("new")',
      },
      {
        kind: 'todo',
        items: [{ id: '1', content: 'Ship transcript UI', status: 'in_progress' }],
      },
      { kind: 'turn_result', ok: true, durationMs: 420 },
    ];

    const html = renderToStaticMarkup(
      <AgentActivityFeed items={items} isLive noActivityText="No activity" labels={labels} />
    );

    expect(html).toContain('Investigating the current implementation');
    expect(html).toContain('I am checking the current implementation.');
    expect(html).toContain('Explored 2 files');
    expect(html).toContain('Read index.ts');
    expect(html).toContain('Code changes');
    expect(html).toContain('src/index.ts');
    expect(html).toContain('+1');
    expect(html).toContain('-1');
    expect(html).toContain('Ship transcript UI');
    expect(html).toContain('Completed');
  });
});
