#!/usr/bin/env node

import { createServer } from 'node:net';
import { execSync } from 'node:child_process';

const port = Number(process.argv[2] || process.env.PORT || 3712);

function describeListener(targetPort) {
  try {
    const out = execSync(`lsof -nP -iTCP:${targetPort} -sTCP:LISTEN`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out;
  } catch {
    return '';
  }
}

const probe = createServer();

probe.once('error', (error) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
    const details = describeListener(port);
    console.error(`[dev] Port ${port} is already in use.`);
    if (details) {
      console.error(details);
    }
    console.error(`[dev] Stop the existing process or run with PORT=<free-port> npm run dev.`);
    process.exit(1);
    return;
  }

  console.error('[dev] Failed to probe dev port:', error);
  process.exit(1);
});

probe.listen(port, '0.0.0.0', () => {
  probe.close(() => process.exit(0));
});
