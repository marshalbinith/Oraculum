/**
 * Realtime event bus over Redis pub/sub. The indexer publishes; the WebSocket
 * server subscribes and fans out to connected clients.
 */
import { getRedis, newSubscriber } from '../cache/redis.js';

export const CHANNEL = 'stellarpredict:events';

export type BusEvent =
  | { type: 'price_update'; market_id: string; yes_price: number; no_price: number; timestamp: number }
  | { type: 'trade'; market_id: string; trade: unknown }
  | { type: 'market_status'; market_id: string; status: string }
  | { type: 'market_resolved'; market_id: string; outcome: string }
  | { type: 'market_created'; market_id: string };

export async function publish(event: BusEvent): Promise<void> {
  await getRedis().publish(CHANNEL, JSON.stringify(event));
}

/** Subscribe to bus events. Returns the subscriber (call `.quit()` to stop). */
export function subscribe(onEvent: (e: BusEvent) => void) {
  const sub = newSubscriber();
  void sub.subscribe(CHANNEL);
  sub.on('message', (_channel, message) => {
    try {
      onEvent(JSON.parse(message) as BusEvent);
    } catch {
      /* ignore malformed */
    }
  });
  return sub;
}
