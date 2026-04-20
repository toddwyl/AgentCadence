import { describe, expect, it } from 'vitest';
import type { AgentStreamUiEvent } from '../../../../domain/run.js';
import { createClaudeStreamJsonWrapper } from '../claude-presenter.js';
import { createCodexStreamJsonWrapper } from '../codex-presenter.js';
import { createCursorStreamJsonWrapper } from '../cursor-presenter.js';

function collectEvents(
  createWrapper: (onUiEvent: (e: AgentStreamUiEvent) => void) => {
    onChunk: (chunk: string) => void;
    finish: (raw: string) => string;
  },
  lines: unknown[]
): AgentStreamUiEvent[] {
  const events: AgentStreamUiEvent[] = [];
  const wrapper = createWrapper((event) => events.push(event));
  for (const line of lines) {
    wrapper.onChunk(`${JSON.stringify(line)}\n`);
  }
  wrapper.finish('');
  return events;
}

describe('CLI transcript presenters', () => {
  it('maps Codex reasoning, command, file change, and mcp result into transcript events', () => {
    const events = collectEvents(
      (onUiEvent) => createCodexStreamJsonWrapper(undefined, onUiEvent),
      [
        { type: 'item.started', item: { type: 'reasoning', text: 'Think first' } },
        {
          type: 'item.started',
          item: { type: 'command_execution', id: 'cmd-1', command: 'echo hi' },
        },
        {
          type: 'item.completed',
          item: {
            type: 'command_execution',
            id: 'cmd-1',
            command: 'echo hi',
            aggregated_output: 'hi',
            exitCode: 0,
            durationMs: 15,
          },
        },
        {
          type: 'item.completed',
          item: { type: 'file_change', changes: [{ path: 'src/demo.ts' }] },
        },
        {
          type: 'item.completed',
          item: {
            type: 'mcp_tool_call',
            id: 'mcp-1',
            tool: 'search_docs',
            result: 'done',
            durationMs: 9,
          },
        },
      ]
    );

    expect(events).toEqual([
      { kind: 'reasoning_delta', text: 'Think first' },
      {
        kind: 'command',
        phase: 'started',
        summary: 'echo hi',
        command: 'echo hi',
        callId: 'cmd-1',
      },
      {
        kind: 'command',
        phase: 'completed',
        summary: 'echo hi · hi',
        command: 'echo hi',
        callId: 'cmd-1',
        durationMs: 15,
        exitCode: 0,
        ok: true,
        resultPreview: 'hi',
      },
      {
        kind: 'file_change',
        path: 'src/demo.ts',
        summary: 'file · src/demo.ts',
      },
      {
        kind: 'tool_result',
        toolName: 'mcp',
        detail: 'search_docs',
        summary: 'mcp · search_docs',
        callId: 'mcp-1',
        resultPreview: 'done',
        durationMs: 9,
        ok: true,
      },
    ]);
  });

  it('maps Claude tool_use, tool_result, thinking, and assistant text into transcript events', () => {
    const events = collectEvents(
      (onUiEvent) => createClaudeStreamJsonWrapper(undefined, onUiEvent),
      [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'thinking', thinking: 'Consider options' },
              {
                type: 'tool_use',
                id: 'tool-1',
                name: 'Read',
                input: { file_path: 'src/app.ts' },
              },
              { type: 'tool_result', tool_use_id: 'tool-1', text: 'contents' },
              { type: 'text', text: 'Done reading.' },
            ],
          },
        },
      ]
    );

    expect(events).toEqual([
      { kind: 'reasoning_delta', text: 'Consider options' },
      {
        kind: 'tool_call',
        phase: 'started',
        summary: 'Read · src/app.ts',
        toolName: 'Read',
        detail: 'src/app.ts',
        callId: 'tool-1',
      },
      {
        kind: 'tool_result',
        summary: 'Read · src/app.ts',
        toolName: 'Read',
        detail: 'src/app.ts',
        callId: 'tool-1',
        resultPreview: 'contents',
      },
      { kind: 'assistant_delta', text: 'Done reading.' },
    ]);
  });

  it('maps Cursor lifecycle events into transcript events', () => {
    const events = collectEvents(
      (onUiEvent) => createCursorStreamJsonWrapper(undefined, onUiEvent),
      [
        {
          type: 'assistant',
          message: {
            content: [
              { type: 'thinking', thinking: 'Plan' },
              { type: 'text', text: 'Scanning files.' },
            ],
          },
        },
        {
          type: 'tool_call',
          subtype: 'started',
          call_id: 'call-1',
          tool_call: {
            readFileToolCall: {
              args: { path: 'src/app.ts' },
            },
          },
        },
        {
          type: 'tool_call',
          subtype: 'completed',
          call_id: 'call-1',
          tool_call: {
            readFileToolCall: {
              args: { path: 'src/app.ts' },
              result: 'file body',
            },
          },
        },
      ]
    );

    expect(events).toEqual([
      { kind: 'reasoning_delta', text: 'Plan' },
      { kind: 'assistant_delta', text: 'Scanning files.' },
      {
        kind: 'tool_call',
        phase: 'started',
        summary: 'read_file · src/app.ts',
        toolName: 'read_file',
        detail: 'src/app.ts',
        callId: 'call-1',
      },
      {
        kind: 'tool_result',
        summary: 'read_file · src/app.ts',
        toolName: 'read_file',
        detail: 'src/app.ts',
        callId: 'call-1',
        resultPreview: 'file body',
      },
    ]);
  });
});
