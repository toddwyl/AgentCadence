#!/usr/bin/env node
/**
 * node-pty macOS/Linux npm tarballs have shipped spawn-helper without the execute bit (644),
 * which makes pty.spawn throw "posix_spawnp failed" (microsoft/node-pty#850, fixed in newer releases).
 * Ensure prebuilt helpers are executable after install.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let pkgRoot;
try {
  pkgRoot = path.dirname(require.resolve('node-pty/package.json'));
} catch {
  console.warn('[fix-node-pty-spawn-helper] node-pty not installed, skip');
  process.exit(0);
}

const prebuilds = path.join(pkgRoot, 'prebuilds');
if (!fs.existsSync(prebuilds)) {
  process.exit(0);
}

for (const name of fs.readdirSync(prebuilds)) {
  const helper = path.join(prebuilds, name, 'spawn-helper');
  if (!fs.existsSync(helper)) continue;
  try {
    fs.chmodSync(helper, 0o755);
  } catch (e) {
    console.warn('[fix-node-pty-spawn-helper]', helper, (e && e.message) || e);
  }
}
