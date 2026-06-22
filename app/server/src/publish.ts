/**
 * Shared publishing core, factored out of routes/broadcast.ts so both the
 * immediate broadcast, the per-content publish, and the scheduler use the exact
 * same send logic (zero duplication, identical behaviour).
 *
 * For each provider: emit pending → sending, attempt a send on a fresh-or-reused
 * VISIBLE connector; if the reused browser turns out to be dead (the user closed
 * the window), drop it and retry once on a fresh one. Emit sent | error.
 *
 * IMPORTANT: this does NOT delete the media files — the caller owns their
 * lifecycle (temp uploads vs. persistent scheduled media).
 */
import type { ProviderId } from "social-connector";
import type { ConnectorManager } from "./ConnectorManager.js";
import { runs } from "./runs.js";
import { isBrowserClosed } from "./browserClosed.js";

export interface PublishOptions {
  manager: ConnectorManager;
  runId: string;
  message: string;
  providers: ProviderId[];
  whatsapp?: { to?: string; chat?: string };
  /** Absolute paths to media files to attach. */
  media: string[];
}

/**
 * Sends `message` (+ optional media) to each selected provider, serialized per
 * provider via manager.run, emitting provider_status events on `runId`.
 * Resolves once every provider has finished (errors are reported as events, not
 * thrown). Does not emit "done" and does not clean up media — the caller does.
 */
export async function publishToProviders(opts: PublishOptions): Promise<void> {
  const { manager, runId, message, providers, whatsapp, media } = opts;

  const jobs = providers.map((p) => {
    runs.emit(runId, { type: "provider_status", data: { provider: p, status: "pending" } });
    return manager.run(p, async () => {
      runs.emit(runId, { type: "provider_status", data: { provider: p, status: "sending" } });
      const postOpts =
        p === "whatsapp"
          ? { target: whatsapp?.to, chat: whatsapp?.chat, media }
          : { media };
      // One send attempt on a fresh-or-reused visible browser.
      const attempt = async () => {
        const c = await manager.getVisible(p);
        if (!(await c.isLoggedIn())) throw new Error("not logged in");
        await c.post(message, postOpts);
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
        runs.emit(runId, {
          type: "provider_status",
          data: { provider: p, status: "error", message: (e as Error).message },
        });
      }
    });
  });

  await Promise.allSettled(jobs);
}
