import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WSMessage } from '../shared/types.js';
import { getActiveRunSnapshots } from './services/live-run-buffer.js';

let wss: WebSocketServer | null = null;

/** Pending review resolvers keyed by `${pipelineId}:${stepId}` */
const pendingReviews = new Map<string, (action: 'accept' | 'reject') => void>();
/** Timers for periodic re-broadcast of review requests */
const pendingReviewTimers = new Map<string, ReturnType<typeof setInterval>>();

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const snapshots = getActiveRunSnapshots();
    if (snapshots.length > 0) {
      const msg: WSMessage = {
        type: 'execution_state_snapshot',
        payload: { runs: snapshots },
      };
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    }
    ws.on('error', () => {});
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as WSMessage;
        if (msg.type === 'step_review_response') {
          const p = msg.payload as { pipelineId: string; stepId: string; action: 'accept' | 'reject' };
          const key = `${p.pipelineId}:${p.stepId}`;
          const resolver = pendingReviews.get(key);
          if (resolver) {
            resolver(p.action);
            pendingReviews.delete(key);
            const timer = pendingReviewTimers.get(key);
            if (timer) { clearInterval(timer); pendingReviewTimers.delete(key); }
          }
        }
      } catch { /* ignore parse errors */ }
    });
  });
}

export function broadcast(message: WSMessage) {
  if (!wss) return;
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

/**
 * Request a review for a completed step.
 * Broadcasts `step_review_requested` and returns a Promise that resolves
 * when a client (web UI or Cursor extension) sends `step_review_response`.
 * Re-broadcasts every 30s as a reminder.
 */
export function requestStepReview(
  pipelineId: string,
  stepId: string,
  workingDirectory: string,
  changedFiles: string[]
): Promise<'accept' | 'reject'> {
  return new Promise((resolve) => {
    const key = `${pipelineId}:${stepId}`;
    pendingReviews.set(key, resolve);
    const doSend = () =>
      broadcast({
        type: 'step_review_requested',
        payload: { pipelineId, stepId, workingDirectory, changedFiles },
      });
    doSend();
    const reminder = setInterval(doSend, 30_000);
    pendingReviewTimers.set(key, reminder);
  });
}

/**
 * Cancel all pending reviews for a pipeline (called when pipeline is stopped).
 * Resolves each pending review as 'reject' so the await unblocks.
 */
export function cancelPendingReviewsForPipeline(pipelineId: string) {
  for (const [key, resolver] of pendingReviews.entries()) {
    if (key.startsWith(pipelineId + ':')) {
      resolver('reject');
      pendingReviews.delete(key);
      const timer = pendingReviewTimers.get(key);
      if (timer) { clearInterval(timer); pendingReviewTimers.delete(key); }
    }
  }
}
