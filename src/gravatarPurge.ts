import Debug from "persistent-debug";

import { GRAVATAR_PURGE_BATCH_SIZE, GRAVATAR_PURGE_DELAY_MS, GRAVATAR_PURGE_POLL_INTERVAL_MS, REDIS_BASE } from "./Config.js";
import { remove } from "./providers/avatar/gravatar.js";
import { redis } from "./redis.js";

const QUEUE_KEY = `${REDIS_BASE}queues:gravatar:purge`;

let started = false;
let running = false;

export async function scheduleGravatarPurge(hash: string, delayMs = GRAVATAR_PURGE_DELAY_MS): Promise<void> {
    const runAt = Date.now() + delayMs;
    await redis.zadd(QUEUE_KEY, runAt.toString(), hash);
    Debug("avatars:gravatar:purge", `Scheduled purge for ${hash} at ${new Date(runAt).toISOString()}`);
}

async function runDuePurges(): Promise<void> {
    if (running) return;
    running = true;
    try {
        const now = Date.now().toString();
        const hashes = await redis.zrangebyscore(QUEUE_KEY, "0", now, "LIMIT", 0, GRAVATAR_PURGE_BATCH_SIZE);
        for (const hash of hashes) {
            const claimed = await redis.zrem(QUEUE_KEY, hash);
            if (claimed === 0) continue;
            await remove(hash);
            Debug("avatars:gravatar:purge", `Purged ${hash}`);
        }
    } catch (error) {
        Debug("avatars:gravatar:purge", "Purge worker failed: %O", error);
    } finally {
        running = false;
    }
}

export function startGravatarPurgeWorker(): void {
    if (started) return;
    started = true;
    void runDuePurges();
    setInterval(() => {
        void runDuePurges();
    }, GRAVATAR_PURGE_POLL_INTERVAL_MS);
}
