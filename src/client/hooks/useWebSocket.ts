import { useEffect, useRef, useCallback } from 'react';
import type { WSMessage } from '@shared/types';

type WSHandler = (msg: WSMessage) => void;

/** Singleton reference so store actions can send WS messages without a hook. */
let globalWs: WebSocket | null = null;

export function sendWSMessage(msg: WSMessage) {
  if (globalWs && globalWs.readyState === WebSocket.OPEN) {
    globalWs.send(JSON.stringify(msg));
  }
}

export function useWebSocket(onMessage: WSHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(url);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WSMessage;
        handlerRef.current(msg);
      } catch { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      globalWs = null;
      setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
    globalWs = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      globalWs = null;
    };
  }, [connect]);
}
