/**
 * Hub bridge + publish/schedule routes, mounted under /api.
 *
 * - /api/hub/*  : transparent proxy to the Python Hub (generation brain).
 * - /api/content/:id/publish   : publish a Hub content now (immediate).
 * - /api/content/:id/schedule  : programme a Hub content for later.
 * - /api/schedule (GET) / /api/schedule/:id (DELETE) : manage the queue.
 *
 * GARDE-FOUS: nothing publishes without an explicit user action; scheduled
 * items live in scheduleStore and are sent only by the scheduler.
 */
import { Router } from "express";
import multer from "multer";
import { tmpdir, homedir } from "node:os";
import { join, extname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { rm, mkdir, copyFile } from "node:fs/promises";
import type { ProviderId } from "social-connector";
import type { ConnectorManager } from "../ConnectorManager.js";
import { runs } from "../runs.js";
import { publishToProviders } from "../publish.js";
import { publishScheduledPost } from "../scheduler.js";
import { hubBaseUrl } from "../hub.js";
import { addScheduled, listScheduled, removeScheduled } from "../scheduleStore.js";

const ALL: ProviderId[] = ["facebook", "whatsapp", "linkedin"];

/** Hub canal key -> Relay ProviderId, by prefix (fb_/li_/wa_). */
function canalToProvider(canal: string | undefined): ProviderId | null {
  if (!canal) return null;
  if (canal.startsWith("fb_")) return "facebook";
  if (canal.startsWith("li_")) return "linkedin";
  if (canal.startsWith("wa_")) return "whatsapp";
  return null;
}

// Same temp-upload setup as broadcast.ts: keep the original extension so
// Playwright infers the right MIME type when attaching.
const storage = multer.diskStorage({
  destination: join(tmpdir(), "relay-uploads"),
  filename: (_req, file, cb) => cb(null, `${randomBytes(16).toString("hex")}${extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { files: 3, fileSize: 512 * 1024 * 1024 } });

/** Persistent media root for scheduled posts (same home dir as settings/store). */
const DATA_DIR = process.env.RELAY_DATA_DIR ?? join(homedir(), ".relay");
const SCHEDULED_MEDIA_DIR = join(DATA_DIR, "scheduled-media");

interface HubContent {
  id: number;
  canal?: string;
  texte?: string;
  [k: string]: unknown;
}

async function fetchHubContent(id: string | number): Promise<HubContent | null> {
  try {
    const res = await fetch(`${hubBaseUrl()}/api/contents/${id}`);
    if (!res.ok) return null;
    return (await res.json()) as HubContent;
  } catch {
    return null;
  }
}

async function hubSetStatut(id: string | number, statut: string): Promise<void> {
  try {
    await fetch(`${hubBaseUrl()}/api/contents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statut }),
    });
  } catch {
    /* non-fatal */
  }
}

function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function contentRouter(manager: ConnectorManager): Router {
  const r = Router();

  // ───────── Hub proxy: /api/hub/<rest> -> <hub>/api/<rest> ─────────
  // Covers GET/POST/PATCH of health, config, generate/*, contents, contents/:id.
  r.all("/hub/*", async (req, res) => {
    const rest = (req.params as Record<string, string>)[0] ?? ""; // everything after /api/hub/
    const qs = req.originalUrl.includes("?") ? req.originalUrl.slice(req.originalUrl.indexOf("?")) : "";
    const url = `${hubBaseUrl()}/api/${rest}${qs}`;
    const method = req.method.toUpperCase();
    const hasBody = method !== "GET" && method !== "HEAD";
    try {
      const upstream = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
      });
      const text = await upstream.text();
      res.status(upstream.status);
      const ct = upstream.headers.get("content-type");
      if (ct) res.set("content-type", ct);
      res.send(text);
    } catch {
      res.status(502).json({ error: "Hub indisponible" });
    }
  });

  // ───────── Resolve providers + message for a publish/schedule action ─────────
  // Uses explicit `providers` if given, else maps the Hub content's canal.
  async function resolve(
    id: string,
    bodyProviders: ProviderId[],
    bodyMessage: string | undefined,
  ): Promise<{ providers: ProviderId[]; message: string } | { error: string }> {
    let message = bodyMessage ?? "";
    let providers = bodyProviders.filter((p) => ALL.includes(p));
    if (providers.length === 0 || !message) {
      const content = await fetchHubContent(id);
      if (!content) return { error: "Contenu introuvable (Hub indisponible ?)" };
      if (!message) message = content.texte ?? "";
      if (providers.length === 0) {
        const p = canalToProvider(content.canal);
        if (p) providers = [p];
      }
    }
    if (providers.length === 0) return { error: "Aucun provider (canal non mappé)" };
    return { providers, message };
  }

  // ───────── Immediate publish ─────────
  r.post("/content/:id/publish", upload.array("media", 3), async (req, res) => {
    const id = String(req.params.id ?? "");
    const providers = parseJsonField<ProviderId[]>(req.body?.providers, []);
    const whatsapp = parseJsonField<{ to?: string; chat?: string } | undefined>(req.body?.whatsapp, undefined);
    const message = req.body?.message ? String(req.body.message) : undefined;

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const media = files.map((f) => f.path);
    const cleanup = () => Promise.all(media.map((p) => rm(p, { force: true }).catch(() => {})));

    const resolved = await resolve(id, providers, message);
    if ("error" in resolved) {
      void cleanup();
      return res.status(400).json({ error: resolved.error });
    }
    if (resolved.providers.includes("whatsapp") && !whatsapp?.to && !whatsapp?.chat) {
      void cleanup();
      return res.status(400).json({ error: "WhatsApp needs a target (to or chat)" });
    }

    const runId = runs.create();
    res.json({ runId });

    void publishToProviders({ manager, runId, message: resolved.message, providers: resolved.providers, whatsapp, media })
      .then(() => { runs.emit(runId, { type: "done", data: {} }); return hubSetStatut(id, "publie"); })
      .finally(() => cleanup());
  });

  // ───────── Schedule for later ─────────
  r.post("/content/:id/schedule", upload.array("media", 3), async (req, res) => {
    const id = String(req.params.id ?? "");
    const publishAt = String(req.body?.publishAt ?? "");
    const providers = parseJsonField<ProviderId[]>(req.body?.providers, []);
    const whatsapp = parseJsonField<{ to?: string; chat?: string } | undefined>(req.body?.whatsapp, undefined);
    const message = req.body?.message ? String(req.body.message) : undefined;

    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const tempPaths = files.map((f) => f.path);
    const cleanupTemp = () => Promise.all(tempPaths.map((p) => rm(p, { force: true }).catch(() => {})));

    if (!publishAt || Number.isNaN(Date.parse(publishAt))) {
      void cleanupTemp();
      return res.status(400).json({ error: "publishAt ISO requis" });
    }
    const resolved = await resolve(id, providers, message);
    if ("error" in resolved) {
      void cleanupTemp();
      return res.status(400).json({ error: resolved.error });
    }
    if (resolved.providers.includes("whatsapp") && !whatsapp?.to && !whatsapp?.chat) {
      void cleanupTemp();
      return res.status(400).json({ error: "WhatsApp needs a target (to or chat)" });
    }

    const scheduledId = randomUUID();
    // Copy uploads to a persistent per-schedule folder, then drop the temps.
    const destDir = join(SCHEDULED_MEDIA_DIR, scheduledId);
    let media: string[] = [];
    try {
      if (files.length > 0) {
        await mkdir(destDir, { recursive: true });
        media = await Promise.all(
          files.map(async (f) => {
            const dest = join(destDir, `${randomBytes(8).toString("hex")}${extname(f.originalname)}`);
            await copyFile(f.path, dest);
            return dest;
          }),
        );
      }
    } catch (e) {
      void cleanupTemp();
      return res.status(500).json({ error: `Échec copie média : ${(e as Error).message}` });
    }
    void cleanupTemp();

    await addScheduled({
      id: scheduledId,
      hubContentId: Number(id),
      publishAt,
      providers: resolved.providers,
      whatsapp,
      media,
      createdAt: new Date().toISOString(),
      // Optional text override carried alongside the frozen interface fields.
      ...(message ? { message } : {}),
    } as Parameters<typeof addScheduled>[0]);

    await hubSetStatut(id, "programme");
    res.json({ ok: true, id: scheduledId });
  });

  // ───────── Queue management ─────────
  r.get("/schedule", async (_req, res) => {
    res.json(await listScheduled());
  });

  // Publish a scheduled post NOW (reuses its persistent media + resolved text,
  // then drops it from the queue). Streams progress on the returned runId.
  r.post("/schedule/:id/publish-now", async (req, res) => {
    const sid = String(req.params.id ?? "");
    const item = (await listScheduled()).find((p) => p.id === sid);
    if (!item) return res.status(404).json({ error: "Programmation introuvable" });
    const runId = runs.create();
    res.json({ runId });
    void publishScheduledPost(manager, item, runId).catch((e) =>
      runs.emit(runId, { type: "error", data: { message: (e as Error).message } }),
    );
  });

  r.delete("/schedule/:id", async (req, res) => {
    const sid = req.params.id;
    const item = (await listScheduled()).find((p) => p.id === sid);
    await removeScheduled(sid);
    if (item) {
      await rm(join(SCHEDULED_MEDIA_DIR, sid), { recursive: true, force: true }).catch(() => {});
      await hubSetStatut(item.hubContentId, "valide");
    }
    res.json({ ok: true });
  });

  return r;
}
