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
import skillRoutes from './routes/skills.js';
import fsRoutes from './routes/fs.js';
import { initWebSocket } from './ws.js';

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
app.use('/api/skills', skillRoutes);
app.use('/api/fs', fsRoutes);

const clientDist = path.resolve(__dirname, '../../dist/client');
app.use(express.static(clientDist));
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = createServer(app);
initWebSocket(server);

server.listen(PORT, () => {
  console.log(`\n  🚀 AgentFlow server running at http://localhost:${PORT}\n`);
});
