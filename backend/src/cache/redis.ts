/** ioredis client factory (lazily constructed singletons). */
import Redis from 'ioredis';
import { getEnv } from '../config/env.js';

let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) client = new Redis(getEnv().REDIS_URL, { lazyConnect: false });
  return client;
}

/** A dedicated connection for pub/sub subscribers (cannot share with commands). */
export function newSubscriber(): Redis {
  return new Redis(getEnv().REDIS_URL);
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
