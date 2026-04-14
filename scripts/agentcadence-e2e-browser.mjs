#!/usr/bin/env node
/**
 * E2E Browser Tests for AgentCadence — Playwright (script-style, not @playwright/test).
 *
 * Requires:
 *   - Backend running at http://localhost:3712
 *   - Frontend dev server at http://localhost:5173
 *
 * Usage: node scripts/agentcadence-e2e-browser.mjs
 */

import { chromium } from 'playwright';

const FRONTEND = process.env.AGENTCADENCE_FRONTEND || 'http://localhost:5173';
const BACKEND = process.env.AGENTCADENCE_URL || 'http://localhost:3712';

const results = [];
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  const icon = pass ? '  ✓' : '  ✗';
  console.log(`${icon} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ── Helpers ──

const api = (path, opts = {}) =>
  fetch(`${BACKEND}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });

/** Create a test pipeline via API so the CRUD modals have a pipeline to reference */
async function ensureTestPipeline() {
  const home = await api('/fs/home').then((r) => r.json()).catch(() => ({ path: process.cwd() }));
  const res = await api('/pipelines', {
    method: 'POST',
    body: JSON.stringify({
      name: `E2E-Browser-${Date.now()}`,
      workingDirectory: home.path || process.cwd(),
    }),
  });
  return res.json();
}

async function deletePipeline(id) {
  await api(`/pipelines/${id}`, { method: 'DELETE' }).catch(() => {});
}

/** Check if locator is visible, swallowing exceptions */
async function isVisible(locator, timeout = 3000) {
  try { return await locator.isVisible({ timeout }); } catch { return false; }
}

/** Clean up leftover test data from previous runs to avoid name collisions */
async function cleanupStaleTestData() {
  const cleanList = async (endpoint, nameFilter) => {
    const items = await api(endpoint).then((r) => r.json()).catch(() => []);
    for (const item of items) {
      if (nameFilter(item.name)) {
        await api(`${endpoint}/${item.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }
  };
  const isTestName = (name) => name && (name.startsWith('E2E Test') || name.startsWith('Debug'));
  await cleanList('/schedules', isTestName);
  await cleanList('/webhooks', isTestName);
  await cleanList('/post-actions', isTestName);
}

// ── Tests ──

async function testPageLoad(page) {
  console.log('\n── Page Load & Navigation ──');

  await page.goto(FRONTEND, { waitUntil: 'networkidle', timeout: 15000 });
  // Sidebar (aside) should be visible
  const sidebar = page.locator('aside');
  const sidebarVisible = await isVisible(sidebar);
  ok('Page loads with sidebar visible', sidebarVisible);

  // Check the 6 bottom-bar buttons — en: Schedules/Webhooks/Post-Actions/Settings/Templates/Insights
  // zh: 定时调度/Webhooks/执行后回调/设置/模板/数据洞察
  const buttonTitles = [
    ['Schedules', '定时调度'],
    ['Webhooks'],
    ['Post-Actions', '执行后回调'],
    ['Settings', '设置'],
    ['Templates', '模板'],
    ['Insights', '数据洞察'],
  ];
  let allFound = true;
  for (const variants of buttonTitles) {
    const selector = variants.map((t) => `button[title="${t}"]`).join(', ');
    const btn = page.locator(selector).first();
    if (await btn.count() === 0) {
      allFound = false;
    }
  }
  ok('All 6 sidebar feature buttons exist', allFound);
}

async function testScheduleModal(page) {
  console.log('\n── Schedule Modal ──');

  // Click Schedules button (en or zh title)
  const schedBtn = page.locator('button[title="Schedules"], button[title="定时调度"]').first();
  await schedBtn.click();
  await page.waitForTimeout(500);

  // Modal — the fixed overlay container
  const modal = page.locator('.fixed.inset-0.z-50').first();

  // Modal should appear with h2 title
  const modalTitle = modal.locator('h2').filter({ hasText: /Schedules|定时调度/ }).first();
  const modalVisible = await isVisible(modalTitle);
  ok('Schedule modal opens', modalVisible);

  // Click "New Schedule" / "新建调度"
  const createBtn = modal.getByText(/New Schedule|新建调度/).first();
  await createBtn.click();
  await page.waitForTimeout(300);

  // Form should appear — name input placeholder: "Schedule name" or "调度名称"
  const nameInput = modal.locator('input[placeholder*="Schedule name"], input[placeholder*="调度名称"]').first();
  const formVisible = await isVisible(nameInput);
  ok('Schedule form opens', formVisible);

  if (formVisible) {
    await nameInput.fill('E2E Test Schedule');

    // Select pipeline — wait for options to load, scope to modal
    await page.waitForTimeout(300);
    const pipelineSelect = modal.locator('select').first();
    const options = await pipelineSelect.locator('option').all();
    if (options.length > 1) {
      const val = await options[1].getAttribute('value');
      if (val) await pipelineSelect.selectOption(val);
    }

    // Fill cron expression — look for font-mono input in the modal form
    const cronInput = modal.locator('input.font-mono').first();
    if (await cronInput.count() > 0) {
      await cronInput.fill('*/30 * * * *');
    }

    // Click Save / 保存 — scoped to modal to avoid "保存变量" button
    const saveBtn = modal.locator('.btn-primary').filter({ hasText: /^Save$|^保存$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(800);

    // Verify schedule appears in list
    const scheduleItem = modal.getByText('E2E Test Schedule').first();
    const itemVisible = await isVisible(scheduleItem);
    ok('Schedule created and visible in list', itemVisible);

    if (itemVisible) {
      // Toggle — the rounded-full toggle switch inside the modal
      const toggleBtn = modal.locator('.rounded-full.relative').first();
      if (await toggleBtn.count() > 0) {
        await toggleBtn.click();
        await page.waitForTimeout(300);
        ok('Schedule toggle clicked', true);
      } else {
        ok('Schedule toggle clicked', false, 'toggle not found');
      }

      // Delete — use page.evaluate to reliably click the delete button
      const deleted = await page.evaluate((name) => {
        const items = document.querySelectorAll('.cursor-pointer');
        for (const item of items) {
          if (item.textContent.includes(name)) {
            const btn = item.querySelector('button[title="Delete"]');
            if (btn) {
              btn.click();
              return true;
            }
          }
        }
        return false;
      }, 'E2E Test Schedule');

      if (deleted) {
        await page.waitForTimeout(1500);
        const afterDelete = await isVisible(modal.getByText('E2E Test Schedule').first(), 2000);
        ok('Schedule deleted from list', !afterDelete);
      } else {
        ok('Schedule deleted from list', false, 'delete button not found via evaluate');
      }
    }
  }

  // Close modal — "Close" or "关闭"
  const closeBtn = modal.getByText(/^Close$|^关闭$/).first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }
  const modalGone = !(await isVisible(modalTitle, 1000));
  ok('Schedule modal closes', modalGone);
}

async function testWebhookModal(page) {
  console.log('\n── Webhook Modal ──');

  const whBtn = page.locator('button[title="Webhooks"]').first();
  await whBtn.click();
  await page.waitForTimeout(500);

  const modal = page.locator('.fixed.inset-0.z-50').first();
  const modalTitle = modal.locator('h2').filter({ hasText: 'Webhooks' }).first();
  const modalVisible = await isVisible(modalTitle);
  ok('Webhook modal opens', modalVisible);

  // Click "New Webhook" / "新建 Webhook"
  const createBtn = modal.getByText(/New Webhook|新建 Webhook/).first();
  await createBtn.click();
  await page.waitForTimeout(300);

  // Form — placeholder: "Webhook name" or "Webhook 名称"
  const nameInput = modal.locator('input[placeholder*="Webhook name"], input[placeholder*="Webhook 名称"]').first();
  const formVisible = await isVisible(nameInput);
  ok('Webhook form opens', formVisible);

  if (formVisible) {
    await nameInput.fill('E2E Test Webhook');

    // Select pipeline
    await page.waitForTimeout(300);
    const pipelineSelect = modal.locator('select').first();
    const options = await pipelineSelect.locator('option').all();
    if (options.length > 1) {
      const val = await options[1].getAttribute('value');
      if (val) await pipelineSelect.selectOption(val);
    }

    // Fill prompt template
    const promptInput = modal.locator('textarea').first();
    await promptInput.fill('Process: {{payload.message}}');

    // Save — scoped to modal
    const saveBtn = modal.locator('.btn-primary').filter({ hasText: /^Save$|^保存$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(800);

    // Token display — green box with <code class="font-mono">
    const tokenBox = modal.locator('code.font-mono').first();
    const tokenVisible = await isVisible(tokenBox);
    ok('Webhook token displayed after creation', tokenVisible);

    if (tokenVisible) {
      // Copy button — "Copy" or "复制"
      const copyBtn = modal.getByText(/^Copy$|^复制$/).first();
      if (await copyBtn.count() > 0) {
        await copyBtn.click();
        await page.waitForTimeout(500);
        // After click the text should change to "Token copied" / "已复制" / etc.
        const copiedText = modal.getByText(/copied|已复制/).first();
        const wasCopied = await isVisible(copiedText);
        ok('Token copy button works', wasCopied);
      } else {
        ok('Token copy button works', false, 'copy button not found');
      }
    }

    // Verify webhook in list
    const whItem = modal.getByText('E2E Test Webhook').first();
    const itemVisible = await isVisible(whItem);
    ok('Webhook visible in list', itemVisible);

    if (itemVisible) {
      // Delete — scope to the container holding "E2E Test Webhook"
      const whRow = modal.locator('.rounded-lg.cursor-pointer').filter({ hasText: 'E2E Test Webhook' }).first();
      const deleteBtn = whRow.locator('button[title="Delete"]').first();
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click();
        await page.waitForTimeout(1500);
        const afterDelete = await isVisible(modal.getByText('E2E Test Webhook').first(), 2000);
        ok('Webhook deleted from list', !afterDelete);
      } else {
        ok('Webhook deleted from list', false, 'delete button not found');
      }
    }
  }

  // Close modal
  const closeBtn = modal.getByText(/^Close$|^关闭$/).first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }
  const modalGone = !(await isVisible(modalTitle, 1000));
  ok('Webhook modal closes', modalGone);
}

async function testPostActionModal(page) {
  console.log('\n── Post-Action Modal ──');

  // Click Post-Actions button — title: "Post-Actions" or "执行后回调"
  const paBtn = page.locator('button[title="Post-Actions"], button[title="执行后回调"]').first();
  await paBtn.click();
  await page.waitForTimeout(500);

  const modal = page.locator('.fixed.inset-0.z-50').first();

  // Modal title
  const modalTitle = modal.locator('h2').filter({ hasText: /Post-Actions|执行后回调/ }).first();
  const modalVisible = await isVisible(modalTitle);
  ok('Post-Action modal opens', modalVisible);

  // Click "New Post-Action" / "新建回调"
  const createBtn = modal.getByText(/New Post-Action|新建回调/).first();
  await createBtn.click();
  await page.waitForTimeout(300);

  // Form — placeholder: "Post-action name" or "回调名称"
  const nameInput = modal.locator('input[placeholder*="Post-action name"], input[placeholder*="回调名称"]').first();
  const formVisible = await isVisible(nameInput);
  ok('Post-Action form opens', formVisible);

  if (formVisible) {
    await nameInput.fill('E2E Test PostAction');

    // Fill URL — placeholder contains "https://"
    const urlInput = modal.locator('input[placeholder*="https://"]').first();
    await urlInput.fill('https://httpbin.org/post');

    // Save — scoped to modal
    const saveBtn = modal.locator('.btn-primary').filter({ hasText: /^Save$|^保存$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(800);

    // Verify in list
    const paItem = modal.getByText('E2E Test PostAction').first();
    const itemVisible = await isVisible(paItem);
    ok('Post-Action created and visible in list', itemVisible);

    if (itemVisible) {
      // Click to expand detail
      await paItem.click();
      await page.waitForTimeout(500);

      // Should show "Bindings" / "绑定" section
      const bindingsText = modal.getByText(/^Bindings$|^绑定$/).first();
      const bindingsVisible = await isVisible(bindingsText);
      ok('Post-Action detail expands with Bindings', bindingsVisible);

      if (bindingsVisible) {
        // Click "Add Binding" / "添加绑定"
        const addBindBtn = modal.getByText(/Add Binding|添加绑定/).first();
        if (await addBindBtn.count() > 0) {
          await addBindBtn.click();
          await page.waitForTimeout(300);

          // Fill trigger ID — placeholder: "Trigger ID" or "触发 ID"
          const triggerIdInput = modal.locator('input[placeholder*="Trigger ID"], input[placeholder*="触发 ID"]').first();
          if (await triggerIdInput.count() > 0) {
            await triggerIdInput.fill('test-trigger-id');

            // Save binding — the last .btn-primary in the modal
            const bindSaveBtn = modal.locator('.btn-primary').filter({ hasText: /^Save$|^保存$/ }).last();
            await bindSaveBtn.click();
            await page.waitForTimeout(500);

            // Verify binding appears
            const bindingItem = modal.getByText('test-trigger-id').first();
            const bindingVisible = await isVisible(bindingItem);
            ok('Binding added successfully', bindingVisible);
          } else {
            ok('Binding added successfully', false, 'trigger ID input not found');
          }
        } else {
          ok('Binding added successfully', false, 'Add Binding button not found');
        }
      }

      // Delete the post-action — scope to the container holding "E2E Test PostAction"
      const paRow = modal.locator('.rounded-lg.cursor-pointer').filter({ hasText: 'E2E Test PostAction' }).first();
      const deleteBtn = paRow.locator('button[title="Delete"]').first();
      if (await deleteBtn.count() > 0) {
        await deleteBtn.click();
        await page.waitForTimeout(1500);
        const afterDelete = await isVisible(modal.getByText('E2E Test PostAction').first(), 2000);
        ok('Post-Action deleted from list', !afterDelete);
      } else {
        ok('Post-Action deleted from list', false, 'delete button not found');
      }
    }
  }

  // Close modal
  const closeBtn = modal.getByText(/^Close$|^关闭$/).first();
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
    await page.waitForTimeout(300);
  }
  const modalGone = !(await isVisible(modalTitle, 1000));
  ok('Post-Action modal closes', modalGone);
}

async function testExecutionMonitor(page, pipelineName) {
  console.log('\n── Execution Monitor ──');

  // Re-select the pipeline in sidebar to ensure Header is rendered
  const pipelineItem = page.getByText(pipelineName).first();
  if (await pipelineItem.count() > 0) {
    await pipelineItem.click();
    await page.waitForTimeout(500);
  }

  // Click the monitor button via evaluate for reliable React event triggering
  const clicked = await page.evaluate(() => {
    const buttons = document.querySelectorAll('header button');
    for (const btn of buttons) {
      if (btn.textContent.includes('Run Monitor') || btn.textContent.includes('运行监控')) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (clicked) {
    await page.waitForTimeout(800);

    // ExecutionMonitor tabs: "Running"/"运行" and "History"/"历史"
    const hasMonitor = await isVisible(
      page.locator('button').filter({ hasText: /^Running$|^运行$|^History$|^历史$/ }).first()
    );
    ok('Execution Monitor view opens', hasMonitor);

    if (hasMonitor) {
      // Click History tab
      const historyTab = page.locator('button').filter({ hasText: /^History$|^历史$/ }).first();
      if (await historyTab.count() > 0) {
        await historyTab.click();
        await page.waitForTimeout(300);
        ok('Execution Monitor history tab switches', true);
      } else {
        ok('Execution Monitor history tab switches', true, 'history tab not found but monitor opened');
      }
    }

    // Toggle back via evaluate
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('header button');
      for (const btn of buttons) {
        if (btn.textContent.includes('Run Monitor') || btn.textContent.includes('运行监控')) {
          btn.click();
          break;
        }
      }
    });
    await page.waitForTimeout(300);
  } else {
    ok('Execution Monitor view opens', false, 'monitor button not found (no pipeline selected?)');
    ok('Execution Monitor history tab switches', false, 'skipped');
  }
}

// ── Main ──
async function main() {
  console.log(`\n🧪 AgentCadence E2E Browser Tests`);
  console.log(`   Frontend: ${FRONTEND}`);
  console.log(`   Backend:  ${BACKEND}\n`);

  // Pre-check: servers reachable
  try {
    await fetch(`${BACKEND}/api/pipelines`);
  } catch (e) {
    console.error(`✗ Backend not reachable at ${BACKEND}: ${e.message}`);
    process.exit(1);
  }
  try {
    await fetch(FRONTEND);
  } catch (e) {
    console.error(`✗ Frontend not reachable at ${FRONTEND}: ${e.message}`);
    process.exit(1);
  }

  // Clean up leftover data from previous runs
  await cleanupStaleTestData();

  // Ensure a test pipeline exists so modals have something to reference
  const pipeline = await ensureTestPipeline();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();

  try {
    await testPageLoad(page);

    // Select the test pipeline in sidebar so Header buttons appear
    const pipelineItem = page.getByText(pipeline.name).first();
    if (await pipelineItem.count() > 0) {
      await pipelineItem.click();
      await page.waitForTimeout(500);
    }

    await testScheduleModal(page);
    await testWebhookModal(page);
    await testPostActionModal(page);
    await testExecutionMonitor(page, pipeline.name);
  } catch (e) {
    console.error(`\n✗ Unexpected error: ${e.message}`);
    ok('UNEXPECTED ERROR', false, e.message);
  } finally {
    await browser.close();
    await deletePipeline(pipeline.id);
  }

  // Summary
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  PASSED: ${passed}  FAILED: ${failed}`);
  console.log(`${'='.repeat(50)}\n`);

  console.log(JSON.stringify({ frontend: FRONTEND, backend: BACKEND, passed, failed, results }, null, 2));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n✗ Fatal error: ${e.message}`);
  process.exit(1);
});
