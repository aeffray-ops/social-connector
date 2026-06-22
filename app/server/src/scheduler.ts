/**
 * Background scheduler: every ~30s, publishes any ScheduledPost whose publishAt
 * is due, then PATCHes the Hub content to "publie", drops the store entry and
 * deletes its persistent media folder.
 *
 * GARDE-FOU: only publishes entries already present in the schedule store —
 * i.e. content the user explicitly validated + programmed. No generation, no
 * auto-publish. A failure on one item is logged and never blocks the others.
 */
import { rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { ConnectorManager } from "./ConnectorManager.js";
import { runs } from "./runs.js";
import { publishToProviders } from "./publish.js";
import { listScheduled, removeScheduled, type ScheduledPost } from "./scheduleStore.js";
import { hubBaseUrl } from "./hub.js";

const TICK_MS = 30_000;
let timer: NodeJS.Timeout | null = null;
let ticking = false;

/** Best-effort fetch of the content's current text from the Hub. */
async function hubText(hubContentId: number): Promise<string> {
  try {
    const res = await fetch(`${hubBaseUrl()}/api/contents/${hubContentId}`);
    if (!res.ok) return "";
    const c = (await res.json()) as { texte?: string };
    return c.texte ?? "";
  } catch {
    return "";
  }
}

/** Best-effort statut PATCH on the Hub (publish bookkeeping). */
async function hubSetStatut(hubContentId: number, statut: string): Promise<void> {
  try {
    await fetch(`${hubBaseUrl()}/api/contents/${hubContentId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ statut }),
    });
  } catch {
    /* non-fatal: the post was sent; bookkeeping can lag */
  }
}

/**
 * Publishes one scheduled post on the given runId, then does the bookkeeping:
 * PATCH Hub -> publie, drop the store entry, delete its persistent media folder.
 * Shared by the scheduler (due items) and the Planning « Publier maintenant »
 * route, so an immediate publish of a scheduled post keeps its persistent media
 * and resolved text instead of losing them.
 */
export async function publishScheduledPost(
  manager: ConnectorManager,
  post: ScheduledPost,
  runId: string,
): Promise<void> {
  const message = (post as { message?: string }).message ?? (await hubText(post.hubContentId));
  await publishToProviders({
    manager,
    runId,
    message,
    providers: post.providers,
    whatsapp: post.whatsapp,
    media: post.media,
  });
  runs.emit(runId, { type: "done", data: {} });
  await hubSetStatut(post.hubContentId, "publie");
  await removeScheduled(post.id);
  // Remove the persistent media folder (media paths live under .../<id>/file).
  const dir = post.media[0] ? dirname(post.media[0]) : null;
  if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
}

async function publishDue(manager: ConnectorManager, post: ScheduledPost): Promise<void> {
  await publishScheduledPost(manager, post, runs.create());
}

async function tick(manager: ConnectorManager): Promise<void> {
  if (ticking) return; // don't overlap a slow tick with the next interval
  ticking = true;
  try {
    const now = Date.now();
    const due = (await listScheduled()).filter((p) => Date.parse(p.publishAt) <= now);
    for (const post of due) {
      try {
        await publishDue(manager, post);
      } catch (e) {
        console.warn(`[Relay] Échec de publication programmée ${post.id} : ${(e as Error).message}`);
      }
    }
  } finally {
    ticking = false;
  }
}

export function startScheduler(manager: ConnectorManager): void {
  if (timer) return;
  timer = setInterval(() => void tick(manager), TICK_MS);
  timer.unref?.();
}

export function stopScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
