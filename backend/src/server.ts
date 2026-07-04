import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';

import { config } from './config.js';
import { requireDevice } from './middleware/deviceAuth.js';
import { createDeviceRouter } from './routes/device.js';
import {
  createArticlesRouter,
  createGroupsRouter,
  createSearchRouter,
} from './routes/groups.js';
import { createFactorsRouter } from './routes/factors.js';
import { createFilesRouter } from './routes/files.js';
import { createSettingsRouter } from './routes/settings.js';
import { createStatsRouter } from './routes/stats.js';
import { createWorkspacesRouter } from './routes/workspaces.js';
import { getActiveWorkspace } from './workspaceManager.js';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  const active = getActiveWorkspace();
  res.json({
    status: 'ok',
    dbPath: config.sqliteDbPath,
    workspaceId: active.id,
    workspaceName: active.name,
  });
});

app.use('/api/device', createDeviceRouter());
app.use('/api/workspaces', createWorkspacesRouter());

app.use('/api', requireDevice);
app.use('/api/settings', createSettingsRouter());
app.use('/api/groups', createGroupsRouter());
app.use('/api/groups/:groupId/articles', createArticlesRouter());
app.use('/api/factors', createFactorsRouter());
app.use('/api/search', createSearchRouter());
app.use('/api/files', createFilesRouter());
app.use('/api/stats', createStatsRouter());

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Erro na API:', error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(config.port, () => {
  const active = getActiveWorkspace();
  console.log(`API rodando em http://localhost:${config.port}`);
  console.log(`Workspace padrão: ${active.name}`);
  console.log(`SQLite DB: ${config.sqliteDbPath}`);
});
