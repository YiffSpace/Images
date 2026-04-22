import debug from "debug";
debug.enable("avatars:*");

import { startGravatarPurgeWorker } from "./gravatarPurge.js";

startGravatarPurgeWorker();

import "./server.js";
