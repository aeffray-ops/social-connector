import { Router } from "express";
import { runAi } from "social-connector";
import { randomUUID } from "node:crypto";
import type { ConnectorManager } from "../ConnectorManager.js";
import { runs } from "../runs.js";

export function aiRouter(manager: ConnectorManager): Router {
  const r = Router();

  r.post("/ai", (req, res) => {
    const instruction = String(req.body?.instruction ?? "").trim();
    if (!instruction) return res.status(400).json({ error: "empty instruction" });
    const runId = runs.create();
    res.json({ runId });

    void manager.run("whatsapp", async () => {
      try {
        const connector = await manager.get("whatsapp");
        await runAi({
          connector,
          instruction,
          output: (line) => runs.emit(runId, { type: "message", data: { text: line } }),
          confirm: async (question) => {
            const confirmId = randomUUID();
            runs.emit(runId, { type: "confirm_request", data: { confirmId, question } });
            return runs.awaitDecision(runId, confirmId);
          },
        });
        runs.emit(runId, { type: "done", data: {} });
      } catch (e) {
        runs.emit(runId, { type: "error", data: { message: (e as Error).message } });
      }
    });
  });

  r.post("/ai/:runId/confirm", (req, res) => {
    const { confirmId, allow } = req.body ?? {};
    runs.decide(req.params.runId, String(confirmId), Boolean(allow));
    res.json({ ok: true });
  });

  return r;
}
