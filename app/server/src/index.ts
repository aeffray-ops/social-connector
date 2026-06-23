import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ConnectorManager } from "./ConnectorManager.js";
import { runs } from "./runs.js";
import { providersRouter } from "./routes/providers.js";
import { broadcastRouter } from "./routes/broadcast.js";
import { readRouter } from "./routes/read.js";
import { aiRouter } from "./routes/ai.js";
import { settingsRouter } from "./routes/settings.js";
import { contentRouter } from "./routes/content.js";
import { renderRouter } from "./routes/render.js";
import { loadSettings } from "./settings.js";
import { startHub, stopHub } from "./hub.js";
import { startScheduler, stopScheduler } from "./scheduler.js";
import { getUsage } from "./usageStore.js";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3001);

export function createApp(manager: ConnectorManager = new ConnectorManager()): express.Express {
  const app = express();
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  // Consommation IA de l'Assistant (la génération est comptée par le Hub → /api/hub/usage).
  app.get("/api/usage", async (_req, res) => res.json(await getUsage()));

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
  app.use("/api", settingsRouter());
  app.use("/api", contentRouter(manager));
  app.use("/api", renderRouter());

  const webDist =
    process.env.RELAY_WEB_DIST ??
    join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  app.use(express.static(webDist));
  return app;
}

/**
 * Starts the server (loads settings first). `port` 0 = OS-assigned free port.
 * Returns the actual bound port. Used by the Electron desktop shell.
 */
/** Wires graceful shutdown of the Hub child + scheduler once per process. */
let shutdownWired = false;
function wireShutdown(): void {
  if (shutdownWired) return;
  shutdownWired = true;
  const cleanup = () => { stopScheduler(); stopHub(); };
  process.once("SIGINT", () => { cleanup(); process.exit(0); });
  process.once("SIGTERM", () => { cleanup(); process.exit(0); });
  process.once("beforeExit", cleanup);
}

export async function startServer(
  port = Number(process.env.RELAY_PORT ?? process.env.PORT ?? 3001),
): Promise<number> {
  await loadSettings();
  const manager = new ConnectorManager();
  // Hub start is best-effort (never fatal); scheduler only sends user-scheduled posts.
  await startHub();
  startScheduler(manager);
  wireShutdown();
  return new Promise((resolve, reject) => {
    const server = createApp(manager).listen(port, HOST, () => {
      const addr = server.address();
      resolve(typeof addr === "object" && addr ? addr.port : port);
    });
    server.on("error", reject);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await loadSettings(); // apply stored API keys to process.env before serving
  const manager = new ConnectorManager();
  await startHub();
  startScheduler(manager);
  wireShutdown();
  const server = createApp(manager).listen(PORT, HOST, () => {
    console.log(`Relay UI on http://${HOST}:${PORT}`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n[Relay] Port ${PORT} is already in use.\n` +
          `Another Relay server (or \`npm run app:dev\`, which serves the API on ${PORT}) is probably running.\n` +
          `Either use the already-running server, stop it, or start this one on another port:\n` +
          `  PORT=3002 npm run app:start\n`,
      );
    } else {
      console.error(`[Relay] Failed to start: ${err.message}`);
    }
    process.exit(1);
  });
}
