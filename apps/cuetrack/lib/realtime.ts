/** STOMP-over-SockJS connection to the backend's CueTrack event topics. */
import { API_URL, getToken } from './api';

export interface RealtimeEvent {
  type: 'BILLIARD_UPDATED' | 'PAYMENT_CREATED' | 'PAYMENT_UPDATED' | 'ACTIVITY' | 'CHANNEL_UPDATED' | 'GAME_UPDATED' | 'CREDITS_CHANGED' | 'FREE_GAME_UPDATED' | 'STK_UPDATED' | 'UNMATCHED_PAYMENT' | 'UNMATCHED_UPDATED' | 'DEVICE_PRESENCE';
  payload: unknown;
}

/**
 * Connects and subscribes to `topic`. Returns a disposer.
 * Libraries are imported lazily so they never run during server rendering.
 */
export function connectRealtime(
  topic: string,
  onEvent: (e: RealtimeEvent) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  let disposed = false;
  let deactivate: (() => void) | null = null;

  (async () => {
    const [{ Client }, SockJS] = await Promise.all([import('@stomp/stompjs'), import('sockjs-client').then((m) => m.default)]);
    if (disposed) return;
    const client = new Client({
      webSocketFactory: () => new SockJS(`${API_URL}/ws`),
      connectHeaders: { Authorization: `Bearer ${getToken() ?? ''}` },
      reconnectDelay: 4000,
      debug: () => {},
      onConnect: () => {
        onStatus?.(true);
        client.subscribe(topic, (msg) => {
          try {
            onEvent(JSON.parse(msg.body) as RealtimeEvent);
          } catch {
            /* ignore malformed frames */
          }
        });
      },
      onWebSocketClose: () => onStatus?.(false),
      onStompError: () => onStatus?.(false),
    });
    client.activate();
    deactivate = () => void client.deactivate();
  })();

  return () => {
    disposed = true;
    deactivate?.();
  };
}
