import type { ToolType } from './pipeline.js';

export type PromptMentionKind = 'skill' | 'command' | 'subagent';

export interface PromptMentionItem {
  id: string;
  kind: PromptMentionKind;
  name: string;
  description: string;
  source: 'project' | 'user';
  tool: ToolType | 'all';
}

export interface PromptMentionsResponse {
  skills: PromptMentionItem[];
  commands: PromptMentionItem[];
  subagents: PromptMentionItem[];
}
