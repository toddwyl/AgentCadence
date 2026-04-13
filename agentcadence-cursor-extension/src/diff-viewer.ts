import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';

/**
 * Show diffs for each changed file by comparing the HEAD version (original)
 * against the current working-tree version (modified).
 */
export async function showStepDiffs(
  workingDirectory: string,
  changedFiles: string[],
): Promise<void> {
  // Ensure the working directory folder is open in the editor.
  const folderUri = vscode.Uri.file(workingDirectory);
  const alreadyOpen = vscode.workspace.workspaceFolders?.some(
    (f) => f.uri.fsPath === folderUri.fsPath,
  );
  if (!alreadyOpen) {
    vscode.workspace.updateWorkspaceFolders(
      vscode.workspace.workspaceFolders?.length ?? 0,
      null,
      { uri: folderUri },
    );
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentcadence-diff-'));

  for (const filePath of changedFiles) {
    const absolutePath = path.resolve(workingDirectory, filePath);
    const modifiedUri = vscode.Uri.file(absolutePath);

    let originalUri: vscode.Uri;
    try {
      const originalContent = execSync(`git show HEAD:${filePath}`, {
        cwd: workingDirectory,
        encoding: 'utf-8',
      });
      const tmpFile = path.join(tmpDir, filePath.replace(/\//g, '_'));
      fs.writeFileSync(tmpFile, originalContent, 'utf-8');
      originalUri = vscode.Uri.file(tmpFile);
    } catch {
      // File is new (not in HEAD). Use an empty untitled URI so the diff
      // shows everything as added.
      const emptyFile = path.join(tmpDir, `empty_${filePath.replace(/\//g, '_')}`);
      fs.writeFileSync(emptyFile, '', 'utf-8');
      originalUri = vscode.Uri.file(emptyFile);
    }

    const title = `Review: ${filePath}`;
    await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
  }
}
