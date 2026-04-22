import Redis from "ioredis";

import { REDIS_URL } from "./Config.js";

export const redis = new Redis(REDIS_URL);
