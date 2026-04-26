import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import sync from "./functions/sync";

const app = new Hono();

app.use("*", logger());
app.use("*", cors({
  origin: "*",
  allowHeaders: ["Authorization", "Content-Type", "apikey"],
  allowMethods: ["GET", "POST", "OPTIONS"],
}));

app.get("/health", (c) => c.json({ ok: true }));

// Kong strips /functions/v1 → requests arrive as /sync, /my-function etc.
app.post("/sync", sync);

// Add new functions here:
// app.post("/my-function", (await import("./functions/my-function")).default);

console.log("🚀 Functions server listening on :9000");

export default {
  port: 9000,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};