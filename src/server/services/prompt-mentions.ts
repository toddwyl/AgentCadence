import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  PromptMentionItem,
  PromptMentionsResponse,
  ToolType,
} from '../../contracts/api/prompt-mentions.js';

function resolveWd(workingDirectory: string): string {
  if (!workingDirectory) return '';
  return workingDirectory.startsWith('~')
    ? path.join(os.homedir(), workingDirectory.slice(1))
    : workingDirectory;
}

export function collectPromptMentions(workingDirectory: string): PromptMentionsResponse {
  const resolvedDir = resolveWd(workingDirectory);
  const skills: PromptMentionItem[] = [];
  const commands: PromptMentionItem[] = [];
  const subagents: PromptMentionItem[] = [];

  if (resolvedDir && fs.existsSync(resolvedDir)) {
    scanProjectSkills(resolvedDir, skills);
    scanProjectCommands(resolvedDir, commands);
    scanProjectSubagents(resolvedDir, subagents);
  }

  scanUserSkills(skills);
  scanUserCommands(commands);
  scanUserSubagents(subagents);

  return { skills, commands, subagents };
}

// ——— Skills (same coverage as legacy /api/skills) ———

function scanProjectSkills(projectDir: string, skills: PromptMentionItem[]) {
  scanSkillSubdirs(path.join(projectDir, '.cursor', 'skills'), skills, 'project', 'cursor');
  scanSkillSubdirs(path.join(projectDir, '.cursor', 'rules'), skills, 'project', 'cursor');
  scanSingleFile(path.join(projectDir, 'CLAUDE.md'), skills, 'project', 'claude');
  scanSkillSubdirs(path.join(projectDir, '.claude', 'skills'), skills, 'project', 'claude');
  scanSingleFile(path.join(projectDir, 'AGENTS.md'), skills, 'project', 'codex');
  scanSkillSubdirs(path.join(projectDir, '.github', 'agents'), skills, 'project', 'codex');
  scanSingleFile(path.join(projectDir, '.cursorrules'), skills, 'project', 'cursor');
}

function scanUserSkills(skills: PromptMentionItem[]) {
  const home = os.homedir();
  scanSkillSubdirs(path.join(home, '.cursor', 'skills'), skills, 'user', 'cursor');
  scanSkillSubdirs(path.join(home, '.cursor', 'skills-cursor'), skills, 'user', 'cursor');
  scanMdFiles(path.join(home, '.cursor', 'rules'), skills, 'user', 'cursor');
  scanSingleFile(path.join(home, '.claude', 'CLAUDE.md'), skills, 'user', 'claude');
  scanSkillSubdirs(path.join(home, '.claude', 'skills'), skills, 'user', 'claude');
}

function scanSkillSubdirs(dir: string, skills: PromptMentionItem[], source: 'project' | 'user', tool: ToolType) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMd = path.join(dir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          try {
            const content = fs.readFileSync(skillMd, 'utf-8');
            const { name, description } = extractMeta(content, entry.name);
            addSkill(skills, {
              id: `skill:${source}:${tool}:${entry.name}`,
              kind: 'skill',
              name,
              description,
              source,
              tool,
            });
          } catch {
            /* skip */
          }
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
          const baseName = entry.name.replace(/\.md$/i, '');
          const { name, description } = extractMeta(content, baseName);
          addSkill(skills, {
            id: `skill:${source}:${tool}:${baseName}`,
            kind: 'skill',
            name,
            description,
            source,
            tool,
          });
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* skip */
  }
}

function scanMdFiles(dir: string, skills: PromptMentionItem[], source: 'project' | 'user', tool: ToolType) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
          const baseName = entry.name.replace(/\.md$/i, '');
          const { name, description } = extractMeta(content, baseName);
          addSkill(skills, {
            id: `skill:${source}:${tool}:${baseName}`,
            kind: 'skill',
            name,
            description,
            source,
            tool,
          });
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* skip */
  }
}

function scanSingleFile(filePath: string, skills: PromptMentionItem[], source: 'project' | 'user', tool: ToolType) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const baseName = path.basename(filePath).replace(/\.md$/i, '').replace(/^\./, '');
    const { name, description } = extractMeta(content, baseName);
    addSkill(skills, {
      id: `skill:${source}:${tool}:${baseName}`,
      kind: 'skill',
      name,
      description,
      source,
      tool,
    });
  } catch {
    /* skip */
  }
}

function addSkill(skills: PromptMentionItem[], skill: PromptMentionItem) {
  if (!skills.some((s) => s.id === skill.id)) skills.push(skill);
}

// ——— Slash commands (.claude/commands, .cursor/commands) ———

function scanProjectCommands(projectDir: string, commands: PromptMentionItem[]) {
  scanCommandDir(path.join(projectDir, '.claude', 'commands'), commands, 'project', 'claude');
  scanCommandDir(path.join(projectDir, '.cursor', 'commands'), commands, 'project', 'cursor');
}

function scanUserCommands(commands: PromptMentionItem[]) {
  const home = os.homedir();
  scanCommandDir(path.join(home, '.claude', 'commands'), commands, 'user', 'claude');
  scanCommandDir(path.join(home, '.cursor', 'commands'), commands, 'user', 'cursor');
}

function scanCommandDir(dir: string, commands: PromptMentionItem[], source: 'project' | 'user', tool: ToolType) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
      try {
        const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
        const baseName = entry.name.replace(/\.md$/i, '');
        const { name, description } = extractMeta(content, baseName);
        const item: PromptMentionItem = {
          id: `command:${source}:${tool}:${baseName}`,
          kind: 'command',
          name,
          description,
          source,
          tool,
        };
        if (!commands.some((c) => c.id === item.id)) commands.push(item);
      } catch {
        /* skip */
      }
    }
  } catch {
    /* skip */
  }
}

// ——— Subagents (.claude/agents, .cursor/agents) ———

function scanProjectSubagents(projectDir: string, subagents: PromptMentionItem[]) {
  scanSubagentDir(path.join(projectDir, '.claude', 'agents'), subagents, 'project', 'claude');
  scanSubagentDir(path.join(projectDir, '.cursor', 'agents'), subagents, 'project', 'cursor');
}

function scanUserSubagents(subagents: PromptMentionItem[]) {
  const home = os.homedir();
  scanSubagentDir(path.join(home, '.claude', 'agents'), subagents, 'user', 'claude');
  scanSubagentDir(path.join(home, '.cursor', 'agents'), subagents, 'user', 'cursor');
}

function scanSubagentDir(dir: string, subagents: PromptMentionItem[], source: 'project' | 'user', tool: ToolType) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const agentMd = path.join(dir, entry.name, 'agent.md');
        const skillMd = path.join(dir, entry.name, 'SKILL.md');
        const pick = fs.existsSync(agentMd) ? agentMd : fs.existsSync(skillMd) ? skillMd : null;
        if (!pick) continue;
        try {
          const content = fs.readFileSync(pick, 'utf-8');
          const { name, description } = extractMeta(content, entry.name);
          const item: PromptMentionItem = {
            id: `subagent:${source}:${tool}:${entry.name}`,
            kind: 'subagent',
            name,
            description,
            source,
            tool,
          };
          if (!subagents.some((s) => s.id === item.id)) subagents.push(item);
        } catch {
          /* skip */
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
          const baseName = entry.name.replace(/\.md$/i, '');
          const { name, description } = extractMeta(content, baseName);
          const item: PromptMentionItem = {
            id: `subagent:${source}:${tool}:${baseName}`,
            kind: 'subagent',
            name,
            description,
            source,
            tool,
          };
          if (!subagents.some((s) => s.id === item.id)) subagents.push(item);
        } catch {
          /* skip */
        }
      }
    }
  } catch {
    /* skip */
  }
}

export function extractMeta(content: string, fallbackName: string): { name: string; description: string } {
  const lines = content.split('\n');
  let name = fallbackName;
  let description = '';

  let inFrontmatter = false;
  let frontmatterDone = false;
  const fmFields: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '---') {
      if (!inFrontmatter && !frontmatterDone) {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        inFrontmatter = false;
        frontmatterDone = true;
        continue;
      }
    }
    if (inFrontmatter) {
      const match = trimmed.match(/^(\w[\w-]*):\s*(.+)$/);
      if (match) fmFields[match[1].toLowerCase()] = match[2].trim();
      continue;
    }
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      name = trimmed.slice(2).trim();
      continue;
    }
    if (
      !description &&
      trimmed &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('```') &&
      !trimmed.startsWith('- ') &&
      !trimmed.startsWith('>')
    ) {
      description = trimmed.slice(0, 150);
      if (name !== fallbackName) break;
    }
  }

  if (fmFields['name']) name = fmFields['name'];
  if (fmFields['description']) description = fmFields['description'].slice(0, 150);

  return { name, description };
}
