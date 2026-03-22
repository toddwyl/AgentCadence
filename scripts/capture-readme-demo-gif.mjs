#!/usr/bin/env node
/**
 * Records a short walkthrough and writes docs/demo.gif (requires: Chromium + ffmpeg).
 * Usage: BASE_URL=http://localhost:3712 node scripts/capture-readme-demo-gif.mjs
 */
import { chromium } from 'playwright';
import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outGif = path.join(root, 'docs', 'demo.gif');
const base = (process.env.BASE_URL || 'http://localhost:3712').replace(/\/$/, '');

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureDemoPipeline() {
  const listUrl = `${base}/api/pipelines`;
  const res = await fetch(listUrl);
  if (!res.ok) throw new Error(`GET ${listUrl} -> ${res.status}`);
  const pipelines = await res.json();
  if (Array.isArray(pipelines) && pipelines.length > 0) return;
  const create = await fetch(listUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Demo pipeline', workingDirectory: '/tmp' }),
  });
  if (!create.ok) throw new Error(`POST ${listUrl} -> ${create.status} ${await create.text()}`);
}

await ensureDemoPipeline();

const videoDir = mkdtempSync(path.join(tmpdir(), 'agentcadence-demo-'));
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
});
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('agentcadence-locale', 'en');
  localStorage.setItem('agentcadence-theme', 'dark');
});

const modalClose = (titleSubstring) =>
  page.locator('.glass-panel-strong').filter({ hasText: titleSubstring }).getByRole('button', { name: 'Close' });

await page.goto(base, { waitUntil: 'networkidle' });
await delay(1800);

// Main editor
await delay(2200);

// Orchestration view → back to editor
await page.locator('header').getByRole('button', { name: 'Orchestration View' }).click();
await delay(2800);
await page.locator('header').getByRole('button', { name: 'Orchestration View' }).click();
await delay(600);

// Run Monitor → back
await page.locator('header').getByRole('button', { name: 'Run Monitor' }).click();
await delay(2800);
await page.locator('header').getByRole('button', { name: 'Run Monitor' }).click();
await delay(600);

// Settings
await page.getByRole('button', { name: 'Settings' }).click();
await delay(2000);
await modalClose('Settings').click();
await delay(500);

// Templates
await page.getByRole('button', { name: 'Templates' }).click();
await delay(1600);
await modalClose('Pipeline Templates').click();
await delay(500);

// Insights
await page.getByRole('button', { name: 'Insights' }).click();
await delay(1600);
await modalClose('Data Insights').click();
await delay(500);

// AI Pipeline Generator
await page.getByRole('button', { name: 'AI Generate' }).click();
await delay(2000);
await modalClose('AI Pipeline Generator').click();
await delay(800);

// End on editor
await delay(1500);

await page.close();
const vid = page.video();
const webmPath = vid ? await vid.path() : null;
await ctx.close();
await browser.close();

if (!webmPath || !existsSync(webmPath)) {
  throw new Error('No recorded video; check Playwright video path.');
}

// Palette GIF: smaller file, acceptable quality
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    webmPath,
    '-vf',
    'fps=10,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=single[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5',
    '-loop',
    '0',
    outGif,
  ],
  { stdio: 'pipe' }
);

rmSync(videoDir, { recursive: true, force: true });
console.log('wrote', path.relative(root, outGif));
