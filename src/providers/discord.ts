import { Client } from "oceanic.js";

import { BOT_TOKEN } from "../Config.js";

import type { ImageMeta } from "../types.js";

export interface DiscordImageMeta extends ImageMeta {
    hash: string | null;
}

export const client = new Client({ auth: `Bot ${BOT_TOKEN}`, disableCache: "no-warning" });
await client.restMode();

export function buildMeta(blobKey: string, hash: string | null, contentType: string, size: number, url: string, shared: boolean): DiscordImageMeta {
    return {
        backend: "fs",
        blobKey,
        contentType,
        createdAt: new Date().toISOString(),
        hash,
        shared,
        size,
        url,
    };
}
