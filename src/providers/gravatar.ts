import { createHash } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";

import { scheduleGravatarPurge } from "../gravatarPurge.js";
import { blobs, meta } from "../storage.js";

import type { ImageMeta } from "../types.js";

export interface GravatarImageMeta extends ImageMeta {
    email: string | null;
    hash: string;
}

interface Data {
    image: Buffer;
    meta: GravatarImageMeta;
}

const SIZE = 128;
const userMetaKey = (hash: string): string => `gravatar/${hash}`;
const userBlobKey = (hash: string): string => `gravatar/${hash.slice(0, 4)}/${hash}.jpg`;

export async function get(hash: string): Promise<Data | null> {
    const metaKey = userMetaKey(hash);
    const blobKey = userBlobKey(hash);
    const existingMeta = await meta.get<GravatarImageMeta>(metaKey);
    if (existingMeta) {
        const image = await blobs.getItemRaw<Buffer>(blobKey);
        if (image) {
            return { image, meta: existingMeta };
        }
    }

    return null;
}

export async function getByEmail(email: string): Promise<Data | null> {
    return get(hashEmail(email));
}

function hashEmail(email: string): string {
    return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function url(hash: string, size = SIZE): string {
    return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=initials&r=x`;
}

export async function findOrCreate(hash: string, email?: string): Promise<Data> {
    const metaKey = userMetaKey(hash);
    const blobKey = userBlobKey(hash);
    const existingMeta = await meta.get(metaKey) as GravatarImageMeta | null;
    if (existingMeta) {
        const image = await blobs.getItemRaw<Buffer>(blobKey);
        if (image) {
            return { image, meta: existingMeta };
        }
    }
    const imageUrl = url(hash);
    const response = await Bun.fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch Gravatar image: ${response.status} ${response.statusText}`);
    }
    const image = await response.arrayBuffer();
    const fileType = await fileTypeFromBuffer(new Uint8Array(image));
    const metaData: GravatarImageMeta = {
        backend: "fs",
        blobKey,
        contentType: fileType?.mime ?? "application/octet-stream",
        createdAt: new Date().toISOString(),
        email: email ?? null,
        hash,
        shared: false,
        size: image.byteLength,
        url: imageUrl,
    };
    await meta.set(metaKey, metaData);
    await blobs.setItemRaw(blobKey, image);
    await scheduleGravatarPurge(hash);
    return { image: Buffer.from(image), meta: metaData };
}

export async function findOrCreateByEmail(email: string): Promise<Data> {
    return findOrCreate(hashEmail(email), email);
}

export async function remove(hash: string): Promise<void> {
    const metaKey = userMetaKey(hash);
    const blobKey = userBlobKey(hash);
    if (await meta.hasItem(metaKey)) await meta.removeItem(metaKey);
    if (await blobs.hasItem(blobKey)) await blobs.removeItem(blobKey);
}
