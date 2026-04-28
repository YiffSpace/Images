import { fileTypeFromBuffer } from "file-type";
import { Client } from "oceanic.js";
import Debug from "persistent-debug";

import { BOT_TOKEN } from "../../Config.js";
import { blobs, meta } from "../../storage.js";

import type { ImageMeta } from "../../types.js";

export interface DiscordImageMeta extends ImageMeta {
    hash: string | null;
}

interface Data {
    image: Buffer;
    meta: DiscordImageMeta;
}

const TYPE = "webp";
const SIZE = 128;
const userMetaKey = (id: string): string => `discord/banner/${id}`;
const userBlobKey = (id: string): string => `discord/banner/${(BigInt(id) % 100n).toString().padStart(2, "0")}/${id}.webp`;
const client = new Client({ auth: `Bot ${BOT_TOKEN}`, disableCache: "no-warning" });
await client.restMode();

function url(id: string, hash: string, type = TYPE, size = SIZE): string {
    return `https://cdn.discordapp.com/banners/${id}/${hash}.${type}?size=${size}`;
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

async function download(id: string, hash: string, type = TYPE, size = SIZE): Promise<Data> {
    Debug(`images:banner:discord:download`, `Downloading banner for ${id} with hash "${hash}"`);
    const imageUrl = url(id, hash, type, size);
    const response = await Bun.fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch banner: ${response.status} ${response.statusText}`);
    }
    const image = await response.arrayBuffer();
    const fileType = await fileTypeFromBuffer(new Uint8Array(image));
    const metaData = buildMeta(userBlobKey(id), hash, fileType?.mime ?? "application/octet-stream", image.byteLength, imageUrl, false);
    return { image: Buffer.from(image), meta: metaData };
}

async function store(id: string, data: Data): Promise<void> {
    Debug(`images:banner:discord:store`, `Storing banner for ${id} with hash "${data.meta.hash ?? ""}"`);
    await meta.set(userMetaKey(id), data.meta);
    if (!data.meta.shared) {
        await blobs.setItemRaw(userBlobKey(id), data.image);
    }
}

async function remove(id: string): Promise<void> {
    Debug(`images:banner:discord:remove`, `Removing banner for ${id}`);
    const metaData = await meta.get<DiscordImageMeta>(userMetaKey(id));
    await meta.removeItem(userMetaKey(id));
    if (metaData && !metaData.shared) {
        await blobs.removeItem(userBlobKey(id));
    } else {
        const exists = await blobs.hasItem(userBlobKey(id));
        if (exists) {
            Debug(`images:banner:discord:remove`, `Blob for ${id} exists but meta is missing, skipping removal`);
        }
    }
}

async function get(id: string): Promise<Data | null> {
    Debug(`images:banner:discord:get`, `Getting banner for ${id}`);
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
    Debug(`images:banner:discord:getCurrentHash`, `Getting current hash for ${id} from Discord API`);
    const user = await client.rest.users.get(id);
    Debug(`images:banner:discord:getCurrentHash`, `Current hash for ${id} is "${user.banner ?? ""}"`);
    return user.banner as string | null;
}

export async function updateIfChanged(id: string, hash: string): Promise<boolean> {
    Debug(`images:banner:discord:updateIfChanged`, `Checking for updates for ${id} with hash "${hash}"`);
    const existing = await get(id);
    if (existing) {
        if (existing.meta.hash !== hash) {
            Debug(`images:banner:discord:updateIfChanged`, `Hash for ${id} changed: "${existing.meta.hash ?? ""}" -> "${hash}"`);
            const data = await download(id, hash);
            await remove(id);
            await store(id, data);
            return true;
        }
        Debug(`images:banner:discord:updateIfChanged`, `Hash for ${id} unchanged, update ignored`);
        return false;
    }
    Debug(`images:banner:discord:updateIfChanged`, `No existing banner for ${id}, downloading new banner with hash "${hash}"`);
    const data = await download(id, hash);
    await store(id, data);
    return true;
}

export async function findOrCreate(id: string, hash?: string): Promise<Data | null> {
    Debug(`images:banner:discord:findOrCreate`, `Finding or creating banner for ${id} with hash "${hash ?? ""}"`);
    const existing = await get(id);
    if (existing) {
        Debug(`images:banner:discord:findOrCreate`, `Found existing banner for ${id} with hash "${existing.meta.hash}"`);
        if (hash) return (await updateIfChanged(id, hash).then(changed => changed ? get(id) : existing))!;
        return existing;
    }
    Debug(`images:banner:discord:findOrCreate`, `No existing banner for ${id}, downloading new banner with hash "${hash ?? ""}"`);
    const currentHash = hash ?? (await getCurrentHash(id));
    if (!currentHash) {
        await remove(id);
        return null;
    }
    const data = await download(id, currentHash);
    await store(id, data);
    return data;
}
