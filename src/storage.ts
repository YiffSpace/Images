import { createStorage } from "unstorage";
import fsDriver from "unstorage/drivers/fs";
import redisDriver from "unstorage/drivers/redis";

import { FS_BASE, REDIS_BASE, REDIS_URL } from "./Config.js";

import type { ImageMeta } from "./types.js";

export const meta = createStorage<ImageMeta>({
    driver: redisDriver({
        base: REDIS_BASE,
        url: REDIS_URL,
    }),
});

export const blobs = createStorage({
    driver: fsDriver({
        base: FS_BASE,
    }),
});
