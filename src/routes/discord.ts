import Router from "@yiffy/bun-router";

import { AuthKey } from "../middleware.js";
import { findOrCreate, updateIfChanged } from "../providers/discord.js";

Router
    .new("/discord/:id", "GET")
    .handle(async (req) => {
        const id = req.params.id;
        const data = await findOrCreate(id);
        return new Response(data.image, {
            headers: {
                "Content-Type": data.meta.contentType,
            },
        });
    })
    .new("/discord/update/:id", "POST")
    .use(AuthKey)
    .handle(async (req) => {
        const id = req.params.id;
        const hash = (await req.body!.json() as { hash: string }).hash;
        const updated = await updateIfChanged(id, hash);
        return Response.json({ updated });
    });
