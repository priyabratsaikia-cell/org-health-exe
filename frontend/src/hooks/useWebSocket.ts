import { useRef, useCallback } from 'react';
import type { WsMessage } from '@/api/types';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback((onMessage: (msg: WsMessage) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.onmessage = (e) => onMessage(JSON.parse(e.data));
        resolve();
        return;
      }
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws/scan`);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.onmessage = (e) => onMessage(JSON.parse(e.data));
        resolve();
      };
      ws.onerror = () => reject(new Error('WebSocket connection failed'));
      ws.onclose = () => { wsRef.current = null; };
    });
  }, []);

  const send = useCallback((data: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const close = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  return { connect, send, close };
}
