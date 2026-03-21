import { Router, type Request, type Response } from 'express';
import { collectPromptMentions } from '../services/prompt-mentions.js';

const router = Router();

/** Skills, slash commands, and subagents for `/` completion in step prompts */
router.get('/', (req: Request, res: Response) => {
  const workingDirectory = (req.query.workingDirectory as string) || '';
  res.json(collectPromptMentions(workingDirectory));
});

export default router;
