import { Middleware } from "@yiffy/bun-router";

import { AUTH_KEY } from "./Config.js";

export const AuthKey = Middleware.BearerAuth({
    validate: token => token === AUTH_KEY,
    status: 403,
    message: "Access Denied",
});
