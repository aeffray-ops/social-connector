/**
 * True when an error means the Playwright browser/page/context is already gone
 * (e.g. the user closed the visible window). Shared by the routes so a dead
 * reused connector can be dropped and retried on a fresh browser instead of
 * surfacing a raw "Target page, context or browser has been closed" to the UI.
 */
export function isBrowserClosed(e: unknown): boolean {
  const msg = (e as Error)?.message ?? "";
  return /has been closed|Target (page|closed)|browser has been closed|Target page, context or browser/i.test(msg);
}
