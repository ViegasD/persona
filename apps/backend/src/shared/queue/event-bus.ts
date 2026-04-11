import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('event-bus');

let pubClient: Redis | null = null;
let subClient: Redis | null = null;

// Active subscriptions: channel → Set of callbacks
const subscriptions = new Map<string, Set<(payload: unknown) => void>>();

function getPub(): Redis {
  if (!pubClient) {
    pubClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    pubClient.on('error', (err) => log.error(err, 'Event-bus pub error'));
  }
  return pubClient;
}

function getSub(): Redis {
  if (!subClient) {
    subClient = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    subClient.on('error', (err) => log.error(err, 'Event-bus sub error'));

    subClient.on('message', (channel: string, message: string) => {
      const cbs = subscriptions.get(channel);
      if (!cbs) return;
      try {
        const parsed = JSON.parse(message);
        for (const cb of cbs) {
          try { cb(parsed); } catch (e) { log.error(e, 'Event-bus callback error'); }
        }
      } catch (e) {
        log.error({ channel, message }, 'Event-bus JSON parse error');
      }
    });
  }
  return subClient;
}

/**
 * Publish an event to a Redis channel.
 */
export async function publishEvent(channel: string, payload: unknown): Promise<void> {
  await getPub().publish(channel, JSON.stringify(payload));
}

/**
 * Subscribe to a Redis channel. Returns an unsubscribe function.
 */
export async function subscribeToChannel(
  channel: string,
  callback: (payload: unknown) => void,
): Promise<() => void> {
  const sub = getSub();

  let cbs = subscriptions.get(channel);
  if (!cbs) {
    cbs = new Set();
    subscriptions.set(channel, cbs);
    await sub.subscribe(channel);
    log.debug({ channel }, 'Subscribed to channel');
  }
  cbs.add(callback);

  return () => {
    cbs!.delete(callback);
    if (cbs!.size === 0) {
      subscriptions.delete(channel);
      sub.unsubscribe(channel).catch(() => {});
      log.debug({ channel }, 'Unsubscribed from channel');
    }
  };
}

/**
 * Close event bus connections. Call on shutdown.
 */
export async function closeEventBus(): Promise<void> {
  subscriptions.clear();
  if (subClient) { await subClient.quit().catch(() => {}); subClient = null; }
  if (pubClient) { await pubClient.quit().catch(() => {}); pubClient = null; }
  log.info('Event bus closed');
}
