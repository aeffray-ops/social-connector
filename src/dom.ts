import type { Page, Locator } from "playwright";
import { SelectorError } from "./errors.js";
import type { Logger } from "./logger.js";
import type { Post } from "./types.js";

/**
 * Tolerant DOM helpers: we try a LIST of candidate selectors and take the
 * first one that matches a visible element. Absorbs language / DOM
 * variations of Facebook (see selectors.ts).
 */

/** Returns the first visible locator among the candidates, or null. */
export async function firstVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs = 8000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  // Small polling loop: Facebook hydrates its DOM in several passes.
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      try {
        // A single selector may match several nodes, some of them hidden
        // (FB often duplicates its elements). We walk through ALL matches
        // and return the first that is actually visible — not just
        // .first(), which may land on a hidden node.
        const loc = page.locator(sel);
        const count = await loc.count();
        for (let i = 0; i < count; i++) {
          const nth = loc.nth(i);
          if (await nth.isVisible()) return nth;
        }
      } catch {
        // invalid selector for this page — keep going
      }
    }
    await page.waitForTimeout(250);
  }
  return null;
}

/** Like firstVisible but throws SelectorError if nothing found. */
export async function requireVisible(
  page: Page,
  selectors: readonly string[],
  label: string,
  timeoutMs = 8000,
): Promise<Locator> {
  const loc = await firstVisible(page, selectors, timeoutMs);
  if (!loc) {
    throw new SelectorError(
      `Element not found: "${label}". Selectors tried:\n  - ${selectors.join(
        "\n  - ",
      )}\nThe site's UI has probably changed — update the selectors for this provider in src/providers/.`,
    );
  }
  return loc;
}

/** True if at least one of the selectors is present (visible) quickly. */
export async function anyVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs = 3000,
): Promise<boolean> {
  return (await firstVisible(page, selectors, timeoutMs)) !== null;
}

/** Waits until none of the selectors are visible anymore (e.g. modal closed). */
export async function waitGone(
  page: Page,
  selectors: readonly string[],
  timeoutMs = 20000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await anyVisible(page, selectors, 600))) return true;
    await page.waitForTimeout(400);
  }
  return false;
}

export interface CollectPostsConfig {
  /** Selector for a single post container. */
  unit: string;
  /** CSS selector(s) for the text node inside a unit. */
  text: string;
  /** CSS selector(s) for the permalink anchor inside a unit. */
  url?: string;
  /** CSS selector(s) for the relative-time node inside a unit. */
  time?: string;
  /** Max number of posts to return. */
  limit: number;
  log: Logger;
  /** Stop after this many scrolls without new posts. Default: 8. */
  maxStale?: number;
  /**
   * Optional filter: receives a candidate post (with its RAW url, query
   * string included) and returns true to keep it. Use to exclude activity
   * that is not an authored post (e.g. comments). Applied before dedup.
   */
  keep?: (candidate: Post) => boolean;
}

/**
 * Scrolls a feed and scrapes post units until `limit` distinct posts are
 * collected or the page stops yielding new ones. Best-effort and tolerant:
 * falls back to a unit's full innerText when the text selector misses.
 */
export async function collectPosts(page: Page, cfg: CollectPostsConfig): Promise<Post[]> {
  const maxStale = cfg.maxStale ?? 8;
  const out: Post[] = [];
  // Feeds (Facebook) virtualize the list: offscreen units are recycled, so we
  // must rescan every scroll. To stay cheap, dedup on the permalink (a fast
  // attribute read) and mark every seen unit — including rejected comments —
  // so we never re-read the expensive innerText of an already-handled unit.
  const seen = new Set<string>();
  let stale = 0;

  while (out.length < cfg.limit && stale < maxStale) {
    const before = out.length;

    let n = 0;
    try {
      n = await page.locator(cfg.unit).count();
    } catch {
      break; // page/browser closed
    }

    for (let i = 0; i < n && out.length < cfg.limit; i++) {
      try {
        const u = page.locator(cfg.unit).nth(i);

        const rawUrl = cfg.url
          ? (await u.locator(cfg.url).first().getAttribute("href").catch(() => null)) ?? undefined
          : undefined;

        // Cheap skip: if we already handled this permalink, don't re-read text.
        if (rawUrl && seen.has(rawUrl)) continue;

        const textLoc = u.locator(cfg.text).first();
        let text = (await textLoc.count())
          ? (await textLoc.innerText().catch(() => "")).trim()
          : "";
        if (!text) text = (await u.innerText().catch(() => "")).trim();
        text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
        if (!text) continue;

        const key = rawUrl ?? text.slice(0, 100);
        if (seen.has(key)) continue;

        const time = cfg.time
          ? (await u.locator(cfg.time).first().innerText().catch(() => "")).trim() || undefined
          : undefined;

        // Mark seen up front so rejected units (e.g. comments) are skipped
        // cheaply on later rescans. Filter on the raw url (comment_id intact),
        // then store a cleaned permalink without tracking params.
        seen.add(key);
        if (cfg.keep && !cfg.keep({ text, url: rawUrl, time })) continue;
        out.push({ text, url: rawUrl ? rawUrl.split("?")[0] : undefined, time });
      } catch {
        // unit detached mid-scrape (virtualization) — skip it
      }
    }

    if (out.length >= cfg.limit) break;
    if (out.length === before) stale++;
    else stale = 0;
    try {
      await page.mouse.wheel(0, 3200);
      await page.waitForTimeout(1000);
    } catch {
      break; // page/browser closed
    }
  }

  cfg.log.info(`Collected ${out.length} post(s).`);
  return out.slice(0, cfg.limit);
}
