import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import pipelineRoutes from './routes/pipelines.js';
import executionRoutes from './routes/execution.js';
import plannerRoutes from './routes/planner.js';
import settingsRoutes from './routes/settings.js';
import templateRoutes from './routes/templates.js';
import promptMentionRoutes from './routes/prompt-mentions.js';
import fsRoutes from './routes/fs.js';
import scheduleRoutes from './routes/schedules.js';
import webhookRoutes from './routes/webhooks.js';
import postActionRoutes from './routes/post-actions.js';
import { initWebSocket } from './ws.js';
import { autoDetectAndSaveProfile } from './services/profile-autodetect.js';
import { startAllSchedules } from './services/cron-scheduler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3712;

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.use('/api/pipelines', pipelineRoutes);
app.use('/api/execution', executionRoutes);
app.use('/api/planner', plannerRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/prompt-mentions', promptMentionRoutes);
app.use('/api/fs', fsRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/post-actions', postActionRoutes);

const clientDist = path.resolve(__dirname, '../../dist/client');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = createServer(app);
initWebSocket(server);
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `\n[AgentCadence] Port ${PORT} is already in use. Stop the existing process or start with PORT=<free-port>.\n`
    );
    process.exit(1);
  }
  throw error;
});

void (async () => {
  try {
    await autoDetectAndSaveProfile();
  } catch (e) {
    console.warn('[AgentCadence] Startup CLI auto-detect failed:', (e as Error).message);
  }
  server.listen(PORT, () => {
    console.log(`\n  🚀 AgentCadence server running at http://localhost:${PORT}\n`);
    startAllSchedules();
  });
})();
