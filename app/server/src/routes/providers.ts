import { Router } from "express";
import type { ProviderId } from "social-connector";
import type { ConnectorManager } from "../ConnectorManager.js";
import { runs } from "../runs.js";

const ALL: ProviderId[] = ["facebook", "whatsapp", "linkedin"];
const LABEL: Record<ProviderId, string> = { facebook: "Facebook", whatsapp: "WhatsApp", linkedin: "LinkedIn" };

export function providersRouter(manager: ConnectorManager): Router {
  const r = Router();

  r.get("/providers", (_req, res) => {
    // Instant: profile-dir existence, no browser launch. login() creates the
    // profile, logout() deletes it, so this tracks "has a session" reliably.
    res.json(ALL.map((id) => ({ id, label: LABEL[id], loggedIn: manager.hasSession(id) })));
  });

  r.post("/login/:provider", (req, res) => {
    const provider = req.params.provider as ProviderId;
    if (!ALL.includes(provider)) return res.status(400).json({ error: "unknown provider" });
    const runId = runs.create();
    res.json({ runId });
    void manager.run(provider, async () => {
      try {
        // Connect = the user explicitly wants to log in. Open the visible
        // window directly — skip the hidden probe ensureLoggedIn would do, so
        // the popup appears as fast as Chromium can launch.
        runs.emit(runId, { type: "progress", data: { status: "login-window-opened" } });
        const c = manager.newConnector(provider, true);
        manager.set(provider, c);
        await c.login();
        runs.emit(runId, { type: "done", data: { loggedIn: true } });
      } catch (e) {
        runs.emit(runId, { type: "error", data: { message: (e as Error).message } });
      }
    });
  });

  r.post("/logout/:provider", async (req, res) => {
    const provider = req.params.provider as ProviderId;
    if (!ALL.includes(provider)) return res.status(400).json({ error: "unknown provider" });
    try {
      await manager.run(provider, () => manager.logout(provider));
      res.json({ ok: true, loggedIn: false });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  return r;
}
