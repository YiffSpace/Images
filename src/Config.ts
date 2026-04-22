/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */

export const REDIS_BASE = process.env.REDIS_BASE || "avatars:";
export const REDIS_URL = process.env.REDIS_URL || "redis://redis";
export const FS_BASE = process.env.FS_BASE || "/app/data/blobs";
export const GRAVATAR_PURGE_DELAY_MS = Number(process.env.GRAVATAR_PURGE_DELAY_MS || 24 * 60 * 60 * 1000);
export const GRAVATAR_PURGE_POLL_INTERVAL_MS = Number(process.env.GRAVATAR_PURGE_POLL_INTERVAL_MS || 60 * 1000);
export const GRAVATAR_PURGE_BATCH_SIZE = Number(process.env.GRAVATAR_PURGE_BATCH_SIZE || 100);
export const BOT_TOKEN = process.env.BOT_TOKEN!;
export const AUTH_KEY = process.env.AUTH_KEY!;

if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is required");
}
if (!AUTH_KEY) {
    throw new Error("AUTH_KEY is required");
}
