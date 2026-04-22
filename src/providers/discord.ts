import { fileTypeFromBuffer } from "file-type";
import { Client } from "oceanic.js";
import Debug from "persistent-debug";

import { BOT_TOKEN } from "../Config.js";
import { blobs, meta } from "../storage.js";

import type { ImageMeta } from "../types.js";

export interface DiscordImageMeta extends ImageMeta {
    hash: string | null;
}

interface Data {
    image: Buffer;
    meta: DiscordImageMeta;
}

const TYPE = "webp";
const SIZE = 128;
const DEFAULTS = [0, 1, 2, 3, 4, 5];
const userMetaKey = (id: string): string => `discord/${id}`;
const userBlobKey = (id: string): string => `discord/${(BigInt(id) % 100n).toString().padStart(2, "0")}/${id}.webp`;
const defaultMetaKey = (n: number): string => `discord/default/${n}`;
const defaultBlobKey = (n: number): string => `discord/default/${n}.png`;
const client = new Client({ auth: `Bot ${BOT_TOKEN}`, disableCache: "no-warning" });
await client.restMode();
await ensureDefaults();

function url(id: string, hash: string, type = TYPE, size = SIZE): string {
    return `https://cdn.discordapp.com/avatars/${id}/${hash}.${type}?size=${size}`;
}

function defaultUrl(n: number): string {
    return `https://cdn.discordapp.com/embed/avatars/${n}.png`;
}

async function ensureDefaults(): Promise<void> {
    for (const n of DEFAULTS) {
        const metaKey = defaultMetaKey(n);
        const hasMeta = await meta.hasItem(metaKey);
        const blobKey = defaultBlobKey(n);
        const hasBlob = await blobs.hasItem(blobKey);
        if (!hasMeta || !hasBlob) {
            Debug(`avatars:discord:defaults`, `Default avatar ${n} is missing, fetching from Discord`);
            const url = defaultUrl(n);
            const response = await Bun.fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch default avatar: ${response.status} ${response.statusText}`);
            }
            const image = await response.arrayBuffer();
            const fileType = await fileTypeFromBuffer(new Uint8Array(image));
            const metaData = buildMeta(blobKey, null, fileType?.mime ?? "application/octet-stream", image.byteLength, url, true);
            await meta.set(metaKey, metaData);
            await blobs.setItemRaw(blobKey, Buffer.from(image));
        }
    }
}

function buildMeta(blobKey: string, hash: string | null, contentType: string, size: number, url: string, shared: boolean): DiscordImageMeta {
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

async function downloadDefault(id: string): Promise<Data> {
    Debug(`avatars:discord:downloadDefault`, `Downloading default avatar for ${id}`);
    await ensureDefaults();
    const n = Number((BigInt(id) << 22n) % 6n);
    const imageUrl = defaultUrl(n);
    const metaData = await meta.get<DiscordImageMeta>(defaultMetaKey(n));
    if (!metaData) {
        throw new Error(`Failed to fetch default avatar: ${imageUrl}`);
    }
    const image = await blobs.getItemRaw<Buffer>(metaData.blobKey);
    if (!image) {
        throw new Error(`Failed to fetch default avatar: ${imageUrl}`);
    }
    return { image, meta: metaData };
}

async function download(id: string, hash: string | null, type = TYPE, size = SIZE): Promise<Data> {
    if (!hash) return downloadDefault(id);
    Debug(`avatars:discord:download`, `Downloading avatar for ${id} with hash "${hash}"`);
    const imageUrl = url(id, hash, type, size);
    const response = await Bun.fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch avatar: ${response.status} ${response.statusText}`);
    }
    const image = await response.arrayBuffer();
    const fileType = await fileTypeFromBuffer(new Uint8Array(image));
    const metaData = buildMeta(userBlobKey(id), hash, fileType?.mime ?? "application/octet-stream", image.byteLength, imageUrl, false);
    return { image: Buffer.from(image), meta: metaData };
}

async function store(id: string, data: Data): Promise<void> {
    Debug(`avatars:discord:store`, `Storing avatar for ${id} with hash "${data.meta.hash ?? ""}"`);
    await meta.set(userMetaKey(id), data.meta);
    if (!data.meta.shared) {
        await blobs.setItemRaw(userBlobKey(id), data.image);
    }
}

async function remove(id: string): Promise<void> {
    Debug(`avatars:discord:remove`, `Removing avatar for ${id}`);
    const metaData = await meta.get<DiscordImageMeta>(userMetaKey(id));
    await meta.removeItem(userMetaKey(id));
    if (metaData && !metaData.shared) {
        await blobs.removeItem(userBlobKey(id));
    } else {
        const exists = await blobs.hasItem(userBlobKey(id));
        if (exists) {
            Debug(`avatars:discord:remove`, `Blob for ${id} exists but meta is missing, skipping removal`);
        }
    }
}

async function get(id: string): Promise<Data | null> {
    Debug(`avatars:discord:get`, `Getting avatar for ${id}`);
    const metaData = await meta.get<DiscordImageMeta>(userMetaKey(id));
    if (!metaData) {
        return null;
    }
    const image = await blobs.getItemRaw<Buffer>(metaData.blobKey);
    if (!image) {
        return null;
    }
    return { image, meta: metaData };
}

async function getCurrentHash(id: string): Promise<string | null> {
    Debug(`avatars:discord:getCurrentHash`, `Getting current hash for ${id} from Discord API`);
    const user = await client.rest.users.get(id);
    Debug(`avatars:discord:getCurrentHash`, `Current hash for ${id} is "${user.avatar ?? ""}"`);
    return user.avatar;
}

export async function updateIfChanged(id: string, hash: string): Promise<boolean> {
    Debug(`avatars:discord:updateIfChanged`, `Checking for updates for ${id} with hash "${hash}"`);
    const existing = await get(id);
    if (existing) {
        if (existing.meta.hash !== hash) {
            Debug(`avatars:discord:updateIfChanged`, `Hash for ${id} changed: "${existing.meta.hash ?? ""}" -> "${hash}"`);
            const data = await download(id, hash);
            await remove(id);
            await store(id, data);
            return true;
        }
        Debug(`avatars:discord:updateIfChanged`, `Hash for ${id} unchanged, update ignored`);
        return false;
    }
    Debug(`avatars:discord:updateIfChanged`, `No existing avatar for ${id}, downloading new avatar with hash "${hash}"`);
    const data = await download(id, hash);
    await store(id, data);
    return true;
}

export async function findOrCreate(id: string, hash?: string): Promise<Data> {
    Debug(`avatars:discord:findOrCreate`, `Finding or creating avatar for ${id} with hash "${hash ?? ""}"`);
    const existing = await get(id);
    if (existing) {
        Debug(`avatars:discord:findOrCreate`, `Found existing avatar for ${id} with hash "${existing.meta.hash}"`);
        if (hash) return (await updateIfChanged(id, hash).then(changed => changed ? get(id) : existing))!;
        return existing;
    }
    Debug(`avatars:discord:findOrCreate`, `No existing avatar for ${id}, downloading new avatar with hash "${hash ?? ""}"`);
    const currentHash = hash ?? (await getCurrentHash(id));
    const data = await download(id, currentHash);
    await store(id, data);
    return data;
}
