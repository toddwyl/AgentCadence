import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { WSMessage } from '../shared/types.js';

let wss: WebSocketServer | null = null;

export function initWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    ws.on('error', () => {});
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
