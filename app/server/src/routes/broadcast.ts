import { Router } from "express";
import type { ProviderId } from "social-connector";
import type { ConnectorManager } from "../ConnectorManager.js";
import { runs } from "../runs.js";

const ALL: ProviderId[] = ["facebook", "whatsapp", "linkedin"];

export function broadcastRouter(manager: ConnectorManager): Router {
  const r = Router();
  r.post("/broadcast", (req, res) => {
    const { message, providers, whatsapp } = req.body ?? {};
    if (!message?.trim()) return res.status(400).json({ error: "empty message" });
    const sel: ProviderId[] = (providers ?? []).filter((p: ProviderId) => ALL.includes(p));
    if (sel.length === 0) return res.status(400).json({ error: "no providers selected" });
    if (sel.includes("whatsapp") && !whatsapp?.to && !whatsapp?.chat) {
      return res.status(400).json({ error: "WhatsApp needs a target (to or chat)" });
    }
    const runId = runs.create();
    res.json({ runId });

    const jobs = sel.map((p) => {
      runs.emit(runId, { type: "provider_status", data: { provider: p, status: "pending" } });
      return manager.run(p, async () => {
        runs.emit(runId, { type: "provider_status", data: { provider: p, status: "sending" } });
        try {
          // Visible connector so the user can watch the post happen.
          const c = await manager.getVisible(p);
          if (!(await c.isLoggedIn())) throw new Error("not logged in");
          const opts = p === "whatsapp" ? { target: whatsapp?.to, chat: whatsapp?.chat } : {};
          await c.post(message, opts);
          runs.emit(runId, { type: "provider_status", data: { provider: p, status: "sent" } });
        } catch (e) {
          runs.emit(runId, { type: "provider_status", data: { provider: p, status: "error", message: (e as Error).message } });
        }
      });
    });
    void Promise.allSettled(jobs).then(() => runs.emit(runId, { type: "done", data: {} }));
  });
  return r;
}
