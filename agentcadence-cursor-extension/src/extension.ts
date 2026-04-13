import * as vscode from 'vscode';
import { WsClient } from './ws-client';
import { showStepDiffs } from './diff-viewer';
import { showReviewNotification } from './review-panel';

let wsClient: WsClient | null = null;
let statusBarItem: vscode.StatusBarItem;

function setStatus(state: 'disconnected' | 'connected' | 'review') {
  const labels: Record<string, string> = {
    disconnected: '$(debug-disconnect) AgentCadence: Disconnected',
    connected: '$(check) AgentCadence: Connected',
    review: '$(eye) AgentCadence: Review',
  };
  statusBarItem.text = labels[state];
  statusBarItem.command = state === 'disconnected'
    ? 'agentcadence.connect'
    : 'agentcadence.disconnect';
}

function connect() {
  if (wsClient) {
    vscode.window.showWarningMessage('AgentCadence is already connected.');
    return;
  }

  const config = vscode.workspace.getConfiguration('agentcadence');
  const url = config.get<string>('serverUrl', 'ws://localhost:3712/ws');

  wsClient = new WsClient(url, handleMessage, () => {
    wsClient = null;
    setStatus('disconnected');
    vscode.window.showInformationMessage('AgentCadence disconnected.');
  });

  setStatus('connected');
  vscode.window.showInformationMessage(`AgentCadence connected to ${url}`);
}

function disconnect() {
  if (!wsClient) {
    vscode.window.showWarningMessage('AgentCadence is not connected.');
    return;
  }
  wsClient.close();
  wsClient = null;
  setStatus('disconnected');
}

async function handleMessage(msg: Record<string, unknown>) {
  const type = msg.type as string | undefined;

  if (type === 'step_review_requested') {
    const payload = msg.payload as Record<string, unknown>;
    const pipelineId = payload.pipelineId as string;
    const stepId = payload.stepId as string;
    const workingDirectory = payload.workingDirectory as string;
    const changedFiles = payload.changedFiles as string[];

    setStatus('review');

    await showStepDiffs(workingDirectory, changedFiles);

    showReviewNotification(stepId, changedFiles, () => {
      wsClient?.send({
        type: 'step_review_response',
        payload: { pipelineId, stepId, action: 'accept' },
      });
      setStatus('connected');
    }, () => {
      wsClient?.send({
        type: 'step_review_response',
        payload: { pipelineId, stepId, action: 'reject' },
      });
      setStatus('connected');
    });
  }
}

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  setStatus('disconnected');
  statusBarItem.show();

  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand('agentcadence.connect', connect),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('agentcadence.disconnect', disconnect),
  );

  const config = vscode.workspace.getConfiguration('agentcadence');
  if (config.get<boolean>('autoConnect', false)) {
    connect();
  }
}

export function deactivate() {
  disconnect();
}
