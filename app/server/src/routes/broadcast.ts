import { Router } from "express";
import multer from "multer";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { randomBytes } from "node:crypto";
import { rm } from "node:fs/promises";
import type { ProviderId } from "social-connector";
import type { ConnectorManager } from "../ConnectorManager.js";
import { runs } from "../runs.js";
import { isBrowserClosed } from "../browserClosed.js";

const ALL: ProviderId[] = ["facebook", "whatsapp", "linkedin"];
// Up to 3 attachments (1 video OR up to 3 images), saved to a temp dir.
// IMPORTANT: keep the original file extension. Playwright infers the MIME type
// from the file's extension when attaching it; an extension-less temp file
// uploads as application/octet-stream and the platforms (FB/LinkedIn/WhatsApp)
// reject it client-side → no preview appears and the send fails silently.
const storage = multer.diskStorage({
  destination: join(tmpdir(), "relay-uploads"),
  filename: (_req, file, cb) => cb(null, `${randomBytes(16).toString("hex")}${extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { files: 3, fileSize: 512 * 1024 * 1024 } });

export function broadcastRouter(manager: ConnectorManager): Router {
  const r = Router();
  // multipart/form-data: text fields + optional media files (field name "media").
  r.post("/broadcast", upload.array("media", 3), (req, res) => {
    const message = (req.body?.message ?? "").toString();
    let providers: ProviderId[] = [];
    try { providers = JSON.parse(req.body?.providers ?? "[]"); } catch { /* ignore */ }
    let whatsapp: { to?: string; chat?: string } | undefined;
    try { whatsapp = req.body?.whatsapp ? JSON.parse(req.body.whatsapp) : undefined; } catch { /* ignore */ }

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const media = files.map((f) => f.path);
    const cleanup = () => Promise.all(media.map((p) => rm(p, { force: true }).catch(() => {})));

    if (!message.trim() && media.length === 0) { void cleanup(); return res.status(400).json({ error: "empty message" }); }
    const sel: ProviderId[] = providers.filter((p) => ALL.includes(p));
    if (sel.length === 0) { void cleanup(); return res.status(400).json({ error: "no providers selected" }); }
    if (sel.includes("whatsapp") && !whatsapp?.to && !whatsapp?.chat) {
      void cleanup();
      return res.status(400).json({ error: "WhatsApp needs a target (to or chat)" });
    }

    const runId = runs.create();
    res.json({ runId });

    const jobs = sel.map((p) => {
      runs.emit(runId, { type: "provider_status", data: { provider: p, status: "pending" } });
      return manager.run(p, async () => {
        runs.emit(runId, { type: "provider_status", data: { provider: p, status: "sending" } });
        const opts =
          p === "whatsapp"
            ? { target: whatsapp?.to, chat: whatsapp?.chat, media }
            : { media };
        // One send attempt on a fresh-or-reused visible browser.
        const attempt = async () => {
          const c = await manager.getVisible(p);
          if (!(await c.isLoggedIn())) throw new Error("not logged in");
          await c.post(message, opts);
        };
        try {
          try {
            await attempt();
          } catch (e) {
            // The reused visible connector may be a now-dead browser — e.g. the
            // login window the user closed after connecting. Drop it and retry
            // once on a fresh browser instead of failing the send.
            if (!isBrowserClosed(e)) throw e;
            await manager.closeConnector(p);
            await attempt();
          }
          runs.emit(runId, { type: "provider_status", data: { provider: p, status: "sent" } });
        } catch (e) {
          runs.emit(runId, { type: "provider_status", data: { provider: p, status: "error", message: (e as Error).message } });
        }
      });
    });
    // Delete the temp uploads only once every provider has finished with them.
    void Promise.allSettled(jobs).then(() => { runs.emit(runId, { type: "done", data: {} }); return cleanup(); });
  });
  return r;
}
