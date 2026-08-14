import Router from "@yiffy/bun-router";

Router.new("/status", "GET")
    .handle(async () => Response.json({ ok: true }, { status: 200 }));
