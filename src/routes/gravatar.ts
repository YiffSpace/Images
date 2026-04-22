import Router from "@yiffy/bun-router";

import { findOrCreate, findOrCreateByEmail } from "../providers/gravatar.js";

Router
    .new("/gravatar/:hash", "GET")
    .handle(async (req) => {
        const hash = req.params.hash;
        const data = await findOrCreate(hash);
        return new Response(data.image, {
            headers: {
                "Content-Type": data.meta.contentType,
            },
        });
    })
    .new("/gravatar/email/:email", "GET")
    .handle(async (req) => {
        const email = req.params.email;
        const data = await findOrCreateByEmail(email);
        return new Response(data.image, {
            headers: {
                "Content-Type": data.meta.contentType,
            },
        });
    });
