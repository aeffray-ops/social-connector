import { Router } from "express";
import type { ProviderId } from "social-connector";
import type { ConnectorManager } from "../ConnectorManager.js";
import { runs } from "../runs.js";
import { isBrowserClosed } from "../browserClosed.js";

const ALL: ProviderId[] = ["facebook", "whatsapp", "linkedin"];
const LABEL: Record<ProviderId, string> = { facebook: "Facebook", whatsapp: "WhatsApp", linkedin: "LinkedIn" };

export function providersRouter(manager: ConnectorManager): Router {
  const r = Router();

  r.get("/providers", (_req, res) => {
    // Instant OPTIMISTIC hint: profile-dir existence, no browser launch.
    // NOTE: the profile dir is created the moment the browser launches (even
    // for an abandoned/failed login), so this can read "connected" while the
    // real session is dead. It's only a fast first paint — the badge truth
    // comes from /verify, which the UI calls on load and on Refresh.
    res.json(ALL.map((id) => ({ id, label: LABEL[id], loggedIn: manager.hasSession(id) })));
  });

  // Real, authoritative check: launches a hidden browser, navigates to the
  // provider home and looks for the logged-in markers. Slower (a few seconds)
  // but it reflects the actual session — this is what Refresh relies on.
  r.post("/verify/:provider", async (req, res) => {
    const provider = req.params.provider as ProviderId;
    if (!ALL.includes(provider)) return res.status(400).json({ error: "unknown provider" });
    try {
      const loggedIn = await manager.run(provider, async () => {
        try {
          const c = await manager.get(provider);
          return await c.isLoggedIn();
        } catch (e) {
          // The reused connector may be a now-dead browser — e.g. the visible
          // login window the user closed after connecting. Drop it and retry
          // once on a fresh hidden browser instead of failing the check.
          if (!isBrowserClosed(e)) throw e;
          await manager.closeConnector(provider);
          const c = await manager.get(provider);
          return await c.isLoggedIn();
        }
      });
      res.json({ id: provider, loggedIn });
    } catch (e) {
      res.json({ id: provider, loggedIn: false, error: (e as Error).message });
    }
  });

  r.post("/login/:provider", (req, res) => {
    const provider = req.params.provider as ProviderId;
    if (!ALL.includes(provider)) return res.status(400).json({ error: "unknown provider" });
    const runId = runs.create();
    res.json({ runId });
    void manager.run(provider, async () => {
      try {
        // Release any browser already open on this profile (e.g. a hidden
        // verify check), otherwise launching the visible login on the same
        // user-data-dir fails with "profile already in use" (exitCode 21).
        await manager.closeConnector(provider);
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
