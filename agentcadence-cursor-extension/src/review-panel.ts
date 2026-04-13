import * as vscode from 'vscode';

/**
 * Show a VS Code information message with Accept / Reject buttons for a
 * pipeline step review.
 */
export function showReviewNotification(
  stepId: string,
  changedFiles: string[],
  onAccept: () => void,
  onReject: () => void,
): void {
  const fileList = changedFiles.length <= 3
    ? changedFiles.join(', ')
    : `${changedFiles.slice(0, 3).join(', ')} and ${changedFiles.length - 3} more`;

  const message = `AgentCadence step "${stepId}" changed ${changedFiles.length} file(s): ${fileList}`;

  vscode.window
    .showInformationMessage(message, 'Accept', 'Reject')
    .then((choice) => {
      if (choice === 'Accept') {
        onAccept();
      } else if (choice === 'Reject') {
        onReject();
      }
      // If dismissed without choosing, do nothing (step stays in review).
    });
}
