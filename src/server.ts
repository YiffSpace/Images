import Router, { Middleware } from "@yiffy/bun-router";
import debug from "debug";
import Debug from "persistent-debug";

Router
    .useAll(Middleware.DebugLog("request:"))
    .useAll(Middleware.Timing)
    .useAll(Middleware.RequestId);

debug.enable("server:*");

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
