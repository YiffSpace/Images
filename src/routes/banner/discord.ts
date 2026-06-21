import Router from "@yiffy/bun-router";

import { AuthKey } from "../../middleware.js";
import { findOrCreate, updateIfChanged } from "../../providers/banner/discord.js";

Router
    .new("/banner/discord/:id", "GET")
    .handle(async (req) => {
        const id = req.params.id;
        const data = await findOrCreate(id);
        if (!data) {
            return new Response(null, { status: 404 });
        }
        return new Response(data.image, {
            headers: {
                "Content-Type": data.meta.contentType,
            },
        });
    })
    .new("/banner/discord/update/:id", "POST")
    .use(AuthKey)
    .handle(async (req) => {
        const id = req.params.id;
        let body: { hash?: unknown } | null = null;
        try {
            body = req.body ? await req.body.json() as { hash?: unknown } : null;
        } catch {
            // invalid JSON
        }
        if (typeof body?.hash !== "string") {
            return Response.json({ message: "Bad Request" }, { status: 400 });
        }
        const updated = await updateIfChanged(id, body.hash);
        return Response.json({ updated });
    });
