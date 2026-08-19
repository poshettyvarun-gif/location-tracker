import { Redis } from "@upstash/redis";

/**
 * Key/value adapter. Uses Upstash Redis when its env vars are present (the
 * Vercel deployment), and an in-process Map otherwise so `npm run server`
 * works locally with no setup.
 *
 * Vercel injects KV_REST_API_* when you attach a Redis store; the UPSTASH_*
 * names are what the Upstash dashboard hands out directly.
 */
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const isRedis = Boolean(url && token);

const redis = isRedis ? new Redis({ url, token }) : null;
const memory = new Map();

export async function kvGet(key) {
  if (redis) return await redis.get(key);
  const hit = memory.get(key);
  return hit === undefined ? null : hit;
}

export async function kvSet(key, value, { ttlSeconds } = {}) {
  if (redis) {
    if (ttlSeconds) await redis.set(key, value, { ex: ttlSeconds });
    else await redis.set(key, value);
    return;
  }
  memory.set(key, value);
  if (ttlSeconds) setTimeout(() => memory.delete(key), ttlSeconds * 1000).unref?.();
}

export async function kvDel(key) {
  if (redis) await redis.del(key);
  else memory.delete(key);
}

/** Only used for the one-time seed check, so a simple existence probe is enough. */
export async function kvExists(key) {
  if (redis) return (await redis.exists(key)) === 1;
  return memory.has(key);
}
