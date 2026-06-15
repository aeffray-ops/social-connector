import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ConnectorManager } from "./ConnectorManager.js";
import { runs } from "./runs.js";
import { providersRouter } from "./routes/providers.js";
import { broadcastRouter } from "./routes/broadcast.js";
import { readRouter } from "./routes/read.js";
import { aiRouter } from "./routes/ai.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3001);

export function createApp(manager: ConnectorManager = new ConnectorManager()): express.Express {
  const app = express();
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.get("/api/events/:runId", (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    const unsub = runs.subscribe(req.params.runId, (e) => {
      res.write(`data: ${JSON.stringify(e)}\n\n`);
    });
    req.on("close", unsub);
  });

  app.use("/api", providersRouter(manager));
  app.use("/api", broadcastRouter(manager));
  app.use("/api", readRouter(manager));
  app.use("/api", aiRouter(manager));

  const webDist = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  app.use(express.static(webDist));
  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createApp().listen(PORT, HOST, () => {
    console.log(`social-connector UI on http://${HOST}:${PORT}`);
  });
}
