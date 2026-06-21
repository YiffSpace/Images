import Router, { Middleware } from "@yiffy/bun-router";

import Log, { withContext } from "./log.js";

Router
    .useAll(async (req, server, next) => {
        let res!: Response;
        await withContext(async () => {
            Log(`images:request:${req.method.toLowerCase()}`, req.url);
            res = await next(req, server);
        });
        return res;
    })
    .useAll(Middleware.Timing)
    .useAll(Middleware.RequestId);

await Router.load(new URL("./routes", import.meta.url));

const server = Bun.serve({
    port: 80,
    hostname: "0.0.0.0",
    routes: Router.toRoutes(),
    idleTimeout: 20,
    fetch(req) {
        Log(`server:${req.method.toLowerCase()}`, req.url);
        return Response.json({ message: "not found" }, { status: 404 });
    },
});

console.log("Server running on %s", server.url);
