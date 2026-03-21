import { Router, type Request, type Response } from 'express';
import { execSync } from 'child_process';
import os from 'os';

const router = Router();

/** Returns user home directory (for default path hints). */
router.get('/home', (_req: Request, res: Response) => {
  res.json({ path: os.homedir() });
});

/**
 * Opens a native folder picker on the machine where the AgentFlow server runs.
 * macOS: osascript, Windows: PowerShell FolderBrowserDialog, Linux: zenity / kdialog.
 */
router.post('/pick-folder', (_req: Request, res: Response) => {
  const platform = process.platform;
  try {
    let picked = '';
    if (platform === 'darwin') {
      picked = execSync(
        `osascript -e 'POSIX path of (choose folder with prompt "Select working directory")'`,
        { timeout: 120_000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
    } else if (platform === 'win32') {
      picked = execSync(
        `powershell -NoProfile -STA -Command "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description='Select working directory'; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath } else { '' }"`,
        { timeout: 120_000, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      ).trim();
    } else {
      try {
        picked = execSync('zenity --file-selection --directory --title="Select folder" 2>/dev/null', {
          timeout: 120_000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch {
        picked = execSync('kdialog --getexistingdirectory . 2>/dev/null', {
          timeout: 120_000,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      }
    }

    if (!picked) {
      res.status(400).json({ error: 'cancelled', cancelled: true });
      return;
    }
    res.json({ path: picked.replace(/\r/g, '').split('\n').filter(Boolean).pop() || picked });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cancel|user aborted|128/i.test(msg)) {
      res.status(400).json({ error: 'cancelled', cancelled: true });
      return;
    }
    res.status(500).json({ error: msg || 'Folder picker failed' });
  }
});

export default router;
