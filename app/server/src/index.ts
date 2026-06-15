import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3001);

export function createApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  // Static web build in production (no-op if absent).
  const webDist = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  app.use(express.static(webDist));
  return app;
}

// Only start the listener when run directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createApp().listen(PORT, HOST, () => {
    console.log(`social-connector UI on http://${HOST}:${PORT}`);
  });
}
