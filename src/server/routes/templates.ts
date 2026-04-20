import { Router, type Request, type Response } from 'express';
import {
  createPipelineFromTemplate,
  createTemplate,
  createTemplateFromPipeline,
  deleteTemplateById,
  exportTemplateMarkdown,
  importTemplateMarkdown,
  listTemplates,
} from '../services/app/template-service.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json(listTemplates());
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, description, stages } = req.body as {
      name?: string;
      description?: string;
      stages?: unknown;
    };
    const template = createTemplate({
      name: name ?? '',
      description,
      stages: Array.isArray(stages) ? (stages as any) : undefined,
    });
    res.status(201).json(template);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

router.post('/from-pipeline/:pipelineId', (req: Request, res: Response) => {
  try {
    const { name, description } = req.body as { name?: string; description?: string };
    const template = createTemplateFromPipeline(req.params.pipelineId, { name, description });
    res.status(201).json(template);
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Pipeline not found') {
      res.status(404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

router.post('/:templateId/create-pipeline', (req: Request, res: Response) => {
  try {
    const { workingDirectory, name } = req.body as {
      workingDirectory?: string;
      name?: string;
    };
    const pipeline = createPipelineFromTemplate(req.params.templateId, {
      workingDirectory: workingDirectory ?? '',
      name,
    });
    res.status(201).json(pipeline);
  } catch (error) {
    const message = (error as Error).message;
    if (message === 'Template not found') {
      res.status(404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  const ok = deleteTemplateById(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ ok: true });
});

router.get('/:id/export-md', (req: Request, res: Response) => {
  try {
    const markdown = exportTemplateMarkdown(req.params.id);
    res.json({ markdown });
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
});

router.post('/import-md', (req: Request, res: Response) => {
  const { markdown } = req.body as { markdown?: string };
  try {
    const template = importTemplateMarkdown(markdown ?? '');
    res.status(201).json(template);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

export default router;
