import Router, { Middleware } from "@yiffy/bun-router";
import Debug from "persistent-debug";

Router
    .useAll(Middleware.DebugLog)
    .useAll(Middleware.Timing)
    .useAll(Middleware.RequestId);

await Router.load(new URL("./routes", import.meta.url));

const server = Bun.serve({
    port: 80,
    hostname: "0.0.0.0",
    routes: Router.toRoutes(),
    idleTimeout: 20,
    fetch(req) {
        Debug(`server:${req.method.toLowerCase()}`, req.url);
        return Response.json({ message: "not found" }, { status: 404 });
    },
});

console.log("Server running on %s", server.url);
