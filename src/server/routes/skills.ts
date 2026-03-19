import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ToolType } from '../../shared/types.js';

const router = Router();

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  source: 'project' | 'user';
  tool: ToolType | 'all';
}

router.get('/', (req: Request, res: Response) => {
  const workingDirectory = (req.query.workingDirectory as string) || '';
  const skills: SkillInfo[] = [];

  const resolvedDir = workingDirectory.startsWith('~')
    ? path.join(os.homedir(), workingDirectory.slice(1))
    : workingDirectory;

  if (resolvedDir && fs.existsSync(resolvedDir)) {
    scanProjectSkills(resolvedDir, skills);
  }

  scanUserSkills(skills);

  res.json(skills);
});

function scanProjectSkills(projectDir: string, skills: SkillInfo[]) {
  scanSkillSubdirs(path.join(projectDir, '.cursor', 'skills'), skills, 'project', 'cursor');
  scanSkillSubdirs(path.join(projectDir, '.cursor', 'rules'), skills, 'project', 'cursor');

  scanSingleFile(path.join(projectDir, 'CLAUDE.md'), skills, 'project', 'claude');
  scanSkillSubdirs(path.join(projectDir, '.claude', 'skills'), skills, 'project', 'claude');

  scanSingleFile(path.join(projectDir, 'AGENTS.md'), skills, 'project', 'codex');
  scanSkillSubdirs(path.join(projectDir, '.github', 'agents'), skills, 'project', 'codex');

  scanSingleFile(path.join(projectDir, '.cursorrules'), skills, 'project', 'cursor');
}

function scanUserSkills(skills: SkillInfo[]) {
  const home = os.homedir();

  scanSkillSubdirs(path.join(home, '.cursor', 'skills'), skills, 'user', 'cursor');
  scanSkillSubdirs(path.join(home, '.cursor', 'skills-cursor'), skills, 'user', 'cursor');
  scanMdFiles(path.join(home, '.cursor', 'rules'), skills, 'user', 'cursor');

  scanSingleFile(path.join(home, '.claude', 'CLAUDE.md'), skills, 'user', 'claude');
  scanSkillSubdirs(path.join(home, '.claude', 'skills'), skills, 'user', 'claude');
}

function scanSkillSubdirs(dir: string, skills: SkillInfo[], source: 'project' | 'user', tool: ToolType) {
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
            addSkill(skills, { id: `${source}:${tool}:${entry.name}`, name, description, source, tool });
          } catch { /* skip */ }
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
          const baseName = entry.name.replace(/\.md$/i, '');
          const { name, description } = extractMeta(content, baseName);
          addSkill(skills, { id: `${source}:${tool}:${baseName}`, name, description, source, tool });
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
}

function scanMdFiles(dir: string, skills: SkillInfo[], source: 'project' | 'user', tool: ToolType) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = fs.readFileSync(path.join(dir, entry.name), 'utf-8');
          const baseName = entry.name.replace(/\.md$/i, '');
          const { name, description } = extractMeta(content, baseName);
          addSkill(skills, { id: `${source}:${tool}:${baseName}`, name, description, source, tool });
        } catch { /* skip */ }
      }
    }
  } catch { /* skip */ }
}

function scanSingleFile(filePath: string, skills: SkillInfo[], source: 'project' | 'user', tool: ToolType) {
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const baseName = path.basename(filePath).replace(/\.md$/i, '').replace(/^\./, '');
    const { name, description } = extractMeta(content, baseName);
    addSkill(skills, { id: `${source}:${tool}:${baseName}`, name, description, source, tool });
  } catch { /* skip */ }
}

function addSkill(skills: SkillInfo[], skill: SkillInfo) {
  if (!skills.some((s) => s.id === skill.id)) {
    skills.push(skill);
  }
}

function extractMeta(content: string, fallbackName: string): { name: string; description: string } {
  const lines = content.split('\n');
  let name = fallbackName;
  let description = '';

  let inFrontmatter = false;
  let frontmatterDone = false;
  const fmFields: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '---') {
      if (!inFrontmatter && !frontmatterDone) { inFrontmatter = true; continue; }
      if (inFrontmatter) { inFrontmatter = false; frontmatterDone = true; continue; }
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
    if (!description && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('```') && !trimmed.startsWith('- ') && !trimmed.startsWith('>')) {
      description = trimmed.slice(0, 150);
      if (name !== fallbackName) break;
    }
  }

  if (fmFields['name']) name = fmFields['name'];
  if (fmFields['description']) description = fmFields['description'].slice(0, 150);

  return { name, description };
}

export default router;
