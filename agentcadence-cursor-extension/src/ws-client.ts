import WebSocket from 'ws';

export type MessageHandler = (msg: Record<string, unknown>) => void;
export type CloseHandler = () => void;

export class WsClient {
  private ws: WebSocket;

  constructor(url: string, onMessage: MessageHandler, onClose: CloseHandler) {
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      // Connection established; nothing extra needed.
    });

    this.ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as Record<string, unknown>;
        onMessage(parsed);
      } catch {
        // Ignore non-JSON messages.
      }
    });

    this.ws.on('close', onClose);

    this.ws.on('error', (err) => {
      console.error('[AgentCadence WsClient]', err.message);
      // The 'close' event will fire after an error, triggering onClose.
    });
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.ws.close();
  }
}
