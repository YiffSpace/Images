import { fileTypeFromBuffer } from "file-type";

import Log from "../../log.js";
import { blobs, meta } from "../../storage.js";
import { buildMeta, client, type DiscordImageMeta } from "../discord.js";

interface Data {
    image: Buffer;
    meta: DiscordImageMeta;
}

const TYPE = "webp";
const SIZE = 128;
const DEFAULTS = [0, 1, 2, 3, 4, 5];
const userMetaKey = (id: string): string => `discord/avatar/${id}`;
const userBlobKey = (id: string): string => `discord/avatar/${(BigInt(id) % 100n).toString().padStart(2, "0")}/${id}.webp`;
const defaultMetaKey = (n: number): string => `discord/avatar/default/${n}`;
const defaultBlobKey = (n: number): string => `discord/avatar/default/${n}.png`;
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
            Log(`images:avatar:discord:defaults`, `Default avatar ${n} is missing, fetching from Discord`);
            const imageUrl = defaultUrl(n);
            const response = await Bun.fetch(imageUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch default avatar "${imageUrl}": ${response.status} ${response.statusText}`);
            }
            const image = await response.arrayBuffer();
            const fileType = await fileTypeFromBuffer(new Uint8Array(image));
            const metaData = buildMeta(blobKey, null, fileType?.mime ?? "application/octet-stream", image.byteLength, imageUrl, true);
            await meta.set(metaKey, metaData);
            await blobs.setItemRaw(blobKey, Buffer.from(image));
        }
    }
}

async function downloadDefault(id: string): Promise<Data> {
    Log(`images:avatar:discord:downloadDefault`, `Downloading default avatar for ${id}`);
    const n = Number((BigInt(id) >> 22n) % 6n);
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
    Log(`images:avatar:discord:download`, `Downloading avatar for ${id} with hash "${hash}"`);
    const imageUrl = url(id, hash, type, size);
    const response = await Bun.fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch avatar "${imageUrl}": ${response.status} ${response.statusText}`);
    }
    const image = await response.arrayBuffer();
    const fileType = await fileTypeFromBuffer(new Uint8Array(image));
    const metaData = buildMeta(userBlobKey(id), hash, fileType?.mime ?? "application/octet-stream", image.byteLength, imageUrl, false);
    return { image: Buffer.from(image), meta: metaData };
}

async function store(id: string, data: Data): Promise<void> {
    Log(`images:avatar:discord:store`, `Storing avatar for ${id} with hash "${data.meta.hash ?? ""}"`);
    await meta.set(userMetaKey(id), data.meta);
    if (!data.meta.shared) {
        await blobs.setItemRaw(userBlobKey(id), data.image);
    }
}

async function remove(id: string): Promise<void> {
    Log(`images:avatar:discord:remove`, `Removing avatar for ${id}`);
    const metaData = await meta.get<DiscordImageMeta>(userMetaKey(id));
    await meta.removeItem(userMetaKey(id));
    if (metaData && !metaData.shared) {
        await blobs.removeItem(userBlobKey(id));
    } else {
        const exists = await blobs.hasItem(userBlobKey(id));
        if (exists) {
            Log(`images:avatar:discord:remove`, `Blob for ${id} exists but meta is missing, skipping removal`);
        }
    }
}

async function get(id: string): Promise<Data | null> {
    Log(`images:avatar:discord:get`, `Getting avatar for ${id}`);
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
    Log(`images:avatar:discord:getCurrentHash`, `Getting current hash for ${id} from Discord API`);
    const user = await client.rest.users.get(id);
    Log(`images:avatar:discord:getCurrentHash`, `Current hash for ${id} is "${user.avatar ?? ""}"`);
    return user.avatar;
}

export async function updateIfChanged(id: string, hash: string): Promise<boolean> {
    Log(`images:avatar:discord:updateIfChanged`, `Checking for updates for ${id} with hash "${hash}"`);
    const existing = await get(id);
    if (existing) {
        if (existing.meta.hash !== hash) {
            Log(`images:avatar:discord:updateIfChanged`, `Hash for ${id} changed: "${existing.meta.hash ?? ""}" -> "${hash}"`);
            const data = await download(id, hash);
            await remove(id);
            await store(id, data);
            return true;
        }
        Log(`images:avatar:discord:updateIfChanged`, `Hash for ${id} unchanged, update ignored`);
        return false;
    }
    Log(`images:avatar:discord:updateIfChanged`, `No existing avatar for ${id}, downloading new avatar with hash "${hash}"`);
    const data = await download(id, hash);
    await store(id, data);
    return true;
}

const inFlight = new Map<string, Promise<Data>>();

async function _findOrCreate(id: string, hash?: string): Promise<Data> {
    Log(`images:avatar:discord:findOrCreate`, `Finding or creating avatar for ${id} with hash "${hash ?? ""}"`);
    const existing = await get(id);
    if (existing) {
        Log(`images:avatar:discord:findOrCreate`, `Found existing avatar for ${id} with hash "${existing.meta.hash}"`);
        if (hash) return (await updateIfChanged(id, hash).then(changed => changed ? get(id) : existing))!;
        return existing;
    }
    Log(`images:avatar:discord:findOrCreate`, `No existing avatar for ${id}, downloading new avatar with hash "${hash ?? ""}"`);
    const currentHash = hash ?? (await getCurrentHash(id));
    const data = await download(id, currentHash);
    await store(id, data);
    return data;
}

export function findOrCreate(id: string, hash?: string): Promise<Data> {
    let promise = inFlight.get(id);
    if (!promise) {
        promise = _findOrCreate(id, hash).finally(() => inFlight.delete(id));
        inFlight.set(id, promise);
    }
    return promise;
}
