#!/usr/bin/env node
/**
 * README screenshots (requires: npx playwright install chromium).
 * Usage: BASE_URL=http://localhost:3712 node scripts/capture-readme-screens.mjs
 *
 * Order: editor + header actions first (no modals), then sidebar modals — avoids
 * full-screen overlays blocking the header.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs');
const base = (process.env.BASE_URL || 'http://localhost:3712').replace(/\/$/, '');

async function ensureDemoPipeline() {
  const listUrl = `${base}/api/pipelines`;
  const res = await fetch(listUrl);
  if (!res.ok) throw new Error(`GET ${listUrl} -> ${res.status}`);
  const pipelines = await res.json();
  if (Array.isArray(pipelines) && pipelines.length > 0) return;
  const create = await fetch(listUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'README demo', workingDirectory: '/tmp' }),
  });
  if (!create.ok) {
    const t = await create.text();
    throw new Error(`POST ${listUrl} -> ${create.status} ${t}`);
  }
}

function modalClose(titleSubstring) {
  return page.locator('.glass-panel-strong').filter({ hasText: titleSubstring }).getByRole('button', { name: 'Close' });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  localStorage.setItem('agentcadence-locale', 'en');
  localStorage.setItem('agentcadence-theme', 'dark');
});

async function shot(name) {
  await page.screenshot({ path: path.join(docs, name), fullPage: false });
  console.log('wrote', name);
}

await ensureDemoPipeline();

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await shot('pipeline-editor.png');

await page.locator('header').getByRole('button', { name: 'Orchestration View' }).click();
await page.waitForTimeout(600);
await shot('orchestration-view.png');
await page.locator('header').getByRole('button', { name: 'Orchestration View' }).click();
await page.waitForTimeout(400);

await page.locator('header').getByRole('button', { name: 'Run Monitor' }).click();
await page.waitForTimeout(600);
await shot('run-monitor.png');
await page.locator('header').getByRole('button', { name: 'Run Monitor' }).click();
await page.waitForTimeout(400);

await page.getByRole('button', { name: 'Settings' }).click();
await page.waitForTimeout(500);
await shot('settings.png');
await modalClose('Settings').click();
await page.waitForTimeout(300);

await page.getByRole('button', { name: 'Templates' }).click();
await page.waitForTimeout(500);
await shot('templates.png');
await modalClose('Pipeline Templates').click();
await page.waitForTimeout(300);

await page.getByRole('button', { name: 'Insights' }).click();
await page.waitForTimeout(500);
await shot('insights.png');
await modalClose('Data Insights').click();
await page.waitForTimeout(300);

await page.getByRole('button', { name: 'AI Generate' }).click();
await page.waitForTimeout(500);
await shot('ai-generate.png');
await modalClose('AI Pipeline Generator').click();
await page.waitForTimeout(300);

await browser.close();
console.log('done');
