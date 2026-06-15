import { Router } from "express";
import type { ProviderId } from "social-connector";
import type { ConnectorManager } from "../ConnectorManager.js";

export function readRouter(manager: ConnectorManager): Router {
  const r = Router();
  const wa = <T>(fn: (c: any) => Promise<T>) =>
    manager.run("whatsapp", async () => fn(await manager.get("whatsapp")));

  r.get("/groups", async (_req, res) => {
    try { res.json(await wa((c) => c.listGroups({ limit: 0 }))); }
    catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  r.get("/chats", async (req, res) => {
    try {
      res.json(await wa((c) => c.listRecentChats({
        limit: Number(req.query.limit ?? 20),
        onlyUnread: req.query.unread === "1",
      })));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  r.get("/conversation", async (req, res) => {
    const chat = String(req.query.chat ?? "");
    if (!chat) return res.status(400).json({ error: "chat required" });
    try {
      res.json(await wa((c) => c.readConversation({
        chat,
        limit: Number(req.query.limit ?? 50),
        since: req.query.since ? String(req.query.since) : undefined,
        cacheMaxAgeMs: req.query.cacheTtl ? Number(req.query.cacheTtl) * 1000 : undefined,
      })));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  r.get("/posts", async (req, res) => {
    const provider = String(req.query.provider ?? "facebook") as ProviderId;
    try {
      res.json(await manager.run(provider, async () =>
        (await manager.get(provider)).read({ limit: Number(req.query.limit ?? 10) }),
      ));
    } catch (e) { res.status(500).json({ error: (e as Error).message }); }
  });

  return r;
}
