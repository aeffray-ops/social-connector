import type { Page } from "playwright";
import { firstVisible, requireVisible, waitGone } from "../dom.js";
import { PostFailedError, SelectorError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { ConversationMessage, RecentChat, SocialProvider } from "../types.js";

/**
 * WhatsApp Web — sends a message to a contact, a group, or a community's
 * announcement group.
 *
 * Login = scan the QR code (manual, like the others: no auto-typing).
 *
 * Two ways to pick the destination:
 *   - options.target = international number WITHOUT '+' (e.g. "33612345678").
 *     A contact has a phone number, so we open it via `send?phone=...`.
 *   - options.chat = a chat/group/community name. Groups and communities have
 *     no phone number, so we open them by typing the name in the search box
 *     and clicking the matching result. EXPERIMENTAL: matched by visible name.
 *
 * In both cases the message is then typed and sent.
 *
 * Selectors NOT verified without a real login: patch at the first SelectorError.
 */

const MESSAGE_BOX = [
  'footer div[contenteditable="true"][role="textbox"]',
  'div[aria-label="Saisissez un message"][contenteditable="true"]',
  'div[aria-label="Type a message"][contenteditable="true"]',
  'footer div[contenteditable="true"]',
];

const SEND_BUTTON = [
  'button[aria-label="Envoyer"]',
  'button[aria-label="Send"]',
  'span[data-icon="send"]',
];

const SEARCH_BOX = [
  // WhatsApp Web now uses a plain <input> for the chat search.
  'input[aria-label*="Recherch"]',
  'input[aria-label*="Search"]',
  'input[placeholder*="Recherch"]',
  'input[placeholder*="Search"]',
  'input[data-tab="3"]',
  // Fallbacks for the older contenteditable search box.
  'div[contenteditable="true"][data-tab="3"]',
  '[aria-label="Search input textbox"]',
];

const INVALID_NUMBER_DIALOG = [
  'div[role="dialog"]:has-text("invalide")',
  'div[role="dialog"]:has-text("invalid")',
  'div[role="dialog"]:has-text("URL invalide")',
];

const CHAT_LIST = ["#pane-side", "#side"];

const GROUPS_TAB = [
  'button[role="tab"]:has-text("Groupes")',
  'button[role="tab"]:has-text("Groups")',
  '[role="tab"]:has-text("Groupes")',
  '[role="tab"]:has-text("Groups")',
];

/** CSS for the chat-row title (the chat name), excluding message previews. */
const CHAT_TITLE = '#pane-side div[data-testid="cell-frame-title"] span[title]';

const UNREAD_TAB = [
  'button[role="tab"]:has-text("Non lus")',
  'button[role="tab"]:has-text("Unread")',
  '[role="tab"]:has-text("Non lus")',
  '[role="tab"]:has-text("Unread")',
];

/** Message rows in the open conversation (WhatsApp Web obfuscates classes). */
const MESSAGE_ROW = '#main div[role="row"]';
/**
 * The `.copyable-text` element carrying `data-pre-plain-text="[HH:MM,
 * DD/MM/YYYY] Sender: "` — its attribute gives time + date + sender, and its
 * innerText is the message body.
 */
const MESSAGE_META = "[data-pre-plain-text]";

/** Parses "[20:15, 14/06/2026] Jean: " -> {time, date, sender}. */
function parsePrePlainText(pre: string | null): { time?: string; date?: string; sender?: string } {
  if (!pre) return {};
  const m = pre.match(/\[\s*([^,\]]+)\s*,\s*([^\]]+)\]\s*(.*?):\s*$/);
  if (!m) return {};
  return { time: m[1]?.trim(), date: m[2]?.trim(), sender: m[3]?.trim() };
}

/** True if `date` (dd/mm/yyyy or mm/dd/yyyy) is on/after the YYYY-MM-DD bound. */
function dateOnOrAfter(date: string, sinceIso: string): boolean {
  const parts = date.split(/[/.-]/).map((p) => parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return true; // unparseable -> keep
  let [a, b, y] = parts as [number, number, number];
  // Disambiguate day/month: if the first field > 12 it must be the day.
  const day = a > 12 ? a : b;
  const month = a > 12 ? b : a;
  if (y < 100) y += 2000;
  const msgTime = new Date(y, month - 1, day).getTime();
  const since = new Date(sinceIso).getTime();
  if (Number.isNaN(msgTime) || Number.isNaN(since)) return true;
  return msgTime >= since;
}

/** Opens a contact's chat via the phone deep-link. */
async function openByPhone(page: Page, phone: string, log: Logger): Promise<void> {
  log.step(`Opening the chat with ${phone}...`);
  await page.goto(`https://web.whatsapp.com/send?phone=${phone}`, {
    waitUntil: "domcontentloaded",
  });
  if (await firstVisible(page, INVALID_NUMBER_DIALOG, 4000)) {
    throw new PostFailedError(
      `WhatsApp: number ${phone} is invalid or not registered on WhatsApp.`,
    );
  }
}

/** Opens a group/community/chat by searching the chat list for its name. */
async function openByName(page: Page, name: string, log: Logger): Promise<void> {
  log.step(`Searching for chat "${name}"...`);
  await page.goto("https://web.whatsapp.com/", { waitUntil: "domcontentloaded" });

  const search = await requireVisible(page, SEARCH_BOX, "WhatsApp search box", 35000);
  await search.click();
  await search.fill("");
  await search.fill(name);
  await page.waitForTimeout(1500);

  // Click the result whose visible title matches the name exactly.
  const result = page.locator("#pane-side").getByTitle(name, { exact: true }).first();
  try {
    await result.waitFor({ state: "visible", timeout: 10000 });
  } catch {
    throw new SelectorError(
      `WhatsApp: no chat titled "${name}" found in the results. ` +
        "Check the exact name (case/accents), or it may not be in your list.",
    );
  }
  await result.click();
}

export const whatsapp: SocialProvider = {
  id: "whatsapp",
  label: "WhatsApp",
  defaultUserDataDir: "./.wa-profile",
  auth: {
    homeUrl: "https://web.whatsapp.com/",
    loginUrl: "https://web.whatsapp.com/",
    // WhatsApp Web can take 10-30s to hydrate the chat list after load.
    loggedInTimeoutMs: 35000,
    loggedInMarkers: [
      "#pane-side",
      'div[aria-label="Liste des discussions"]',
      'div[aria-label="Chat list"]',
      'header[data-testid="chatlist-header"]',
      '[data-icon="new-chat-outline"]',
      '[data-icon="chats"]',
      '[data-icon="chats-filled"]',
      'div[title="Nouvelle discussion"]',
      'div[contenteditable="true"][data-tab="3"]',
      "#side",
    ],
    loggedOutMarkers: [
      'canvas[aria-label*="Scan"]',
      'canvas[aria-label*="scan"]',
      "div[data-ref]",
      '[data-icon="intro-md-beta-logo-dark"]',
      '[aria-label*="QR"]',
      'div:has-text("to log in")',
      'div:has-text("Log in")',
    ],
    // WhatsApp Web does not show a cookie banner.
  },

  async post({ page, content, options, log }) {
    // `chat` (group/community by name) takes precedence over `target` (phone).
    if (options.chat?.trim()) {
      await openByName(page, options.chat.trim(), log);
    } else {
      const phone = (options.target ?? "").replace(/[^0-9]/g, "");
      if (!phone) {
        throw new PostFailedError(
          "WhatsApp: provide --to <number> (contact) or --chat <name> (group/community).",
        );
      }
      await openByPhone(page, phone, log);
    }

    log.step("Waiting for the message box...");
    const box = await requireVisible(page, MESSAGE_BOX, "WhatsApp message box", 30000);
    await box.click();

    log.step("Typing the message...");
    await box.type(content, { delay: 10 });

    if (options.screenshotPath) {
      await page.screenshot({ path: options.screenshotPath }).catch(() => {});
      log.info(`Screenshot: ${options.screenshotPath}`);
    }

    log.step("Sending the message...");
    const send = await firstVisible(page, SEND_BUTTON, 4000);
    if (send) await send.click();
    else await page.keyboard.press("Enter");

    // Best-effort confirmation: the send button disappears once sent.
    await waitGone(page, SEND_BUTTON, 8000);
    log.step("Message sent.");
  },

  async listGroups({ page, options, log }) {
    const limit = options.limit ?? 0; // 0 = all
    log.step("Opening WhatsApp...");
    await page.goto("https://web.whatsapp.com/", { waitUntil: "domcontentloaded" });
    await requireVisible(page, CHAT_LIST, "WhatsApp chat list", 35000);

    log.step("Filtering to groups...");
    const tab = await firstVisible(page, GROUPS_TAB, 8000);
    if (tab) await tab.click().catch(() => {});
    else log.info("Groups filter not found — results may include non-groups.");
    await page.waitForTimeout(1500);

    log.step("Collecting group names...");
    const names = new Set<string>();
    let stale = 0;
    while (stale < 6) {
      const before = names.size;
      const batch = await page
        .locator(CHAT_TITLE)
        .evaluateAll((els) =>
          els.map((e) => e.getAttribute("title") ?? "").filter(Boolean),
        )
        .catch(() => [] as string[]);
      for (const n of batch) names.add(n);

      if (limit && names.size >= limit) break;
      if (names.size === before) stale++;
      else stale = 0;
      // Scroll the chat-list pane (virtualized) to load more rows.
      await page
        .locator("#pane-side")
        .evaluate((el) => el.scrollBy(0, Math.round(el.clientHeight * 0.85)))
        .catch(() => {});
      await page.waitForTimeout(700);
    }

    const list = [...names];
    log.info(`Found ${list.length} group(s).`);
    return limit ? list.slice(0, limit) : list;
  },

  async readConversation({ page, options, log }) {
    const chat = options.chat?.trim();
    if (!chat) throw new PostFailedError("WhatsApp: read_conversation requires a chat name.");
    const limit = options.limit ?? 50;

    await openByName(page, chat, log);
    log.step("Waiting for the conversation...");
    await requireVisible(page, ["#main"], "WhatsApp conversation pane", 30000);
    await page.waitForTimeout(1000);

    // Scroll up a few times to load enough recent bubbles (cap on scrolls
    // keeps us from walking the whole history — `limit` is the real bound).
    log.step(`Collecting up to ${limit} message(s)...`);
    for (let i = 0; i < 8; i++) {
      if ((await page.locator(MESSAGE_ROW).count()) >= limit) break;
      await page
        .locator("#main")
        .evaluate((el) => {
          const scroller = el.querySelector('div[tabindex="0"], div.copyable-area') ?? el;
          scroller.scrollTop = 0;
        })
        .catch(() => {});
      await page.waitForTimeout(700);
    }

    const rows = page.locator(MESSAGE_ROW);
    const n = await rows.count();
    const out: ConversationMessage[] = [];
    for (let i = 0; i < n; i++) {
      const row = rows.nth(i);
      const meta = row.locator(MESSAGE_META).first();
      if ((await meta.count()) === 0) continue; // date dividers / system rows
      const pre = await meta.getAttribute("data-pre-plain-text").catch(() => null);
      const text = (await meta.innerText().catch(() => "")).trim();
      if (!text) continue;
      const { time, date, sender } = parsePrePlainText(pre);
      // data-id is "true_..." for outgoing, "false_..." for incoming.
      const dataId = (await row.getAttribute("data-id").catch(() => "")) ?? "";
      const from = dataId.startsWith("true") ? "me" : sender ?? "?";
      out.push({ from, text, time, date, id: dataId || undefined });
    }

    // Best-effort date filter; `limit` is the hard cap (keep the most recent).
    const filtered = options.since
      ? out.filter((m) => !m.date || dateOnOrAfter(m.date, options.since!))
      : out;
    log.info(`Collected ${filtered.length} message(s).`);
    return filtered.slice(-limit);
  },

  async listRecentChats({ page, options, log }) {
    const limit = options.limit ?? 20;
    log.step("Opening WhatsApp...");
    await page.goto("https://web.whatsapp.com/", { waitUntil: "domcontentloaded" });
    await requireVisible(page, CHAT_LIST, "WhatsApp chat list", 35000);

    if (options.onlyUnread) {
      log.step("Filtering to unread...");
      const tab = await firstVisible(page, UNREAD_TAB, 8000);
      if (tab) await tab.click().catch(() => {});
      else log.info("Unread filter not found — listing all recent chats.");
      await page.waitForTimeout(1200);
    }

    log.step(`Collecting up to ${limit} recent chat(s)...`);
    const byName = new Map<string, RecentChat>();
    let stale = 0;
    while (byName.size < limit && stale < 6) {
      const before = byName.size;
      const batch = await page
        .locator('#pane-side div[role="row"]')
        .evaluateAll((rows) =>
          rows
            .map((r) => {
              const name =
                r
                  .querySelector('[data-testid="cell-frame-title"] span[title]')
                  ?.getAttribute("title") ?? "";
              const time =
                r.querySelector('[data-testid="cell-frame-primary-detail"]')?.textContent?.trim() ??
                "";
              const preview = (
                r.querySelector('[data-testid="cell-frame-secondary"]')?.textContent ?? ""
              )
                // Drop icon pseudo-text leaking into textContent (status ticks,
                // voice-note icon, etc.): "wds-ic-read", "ic-keyboard-voice-filled".
                .replace(/(wds-)?ic-[\w-]+/g, "")
                .trim();
              const badge = r.querySelector(
                '[aria-label*="non lu"], [aria-label*="Non lu"], [aria-label*="unread"]',
              );
              let unread = 0;
              if (badge) {
                const m = (badge.getAttribute("aria-label") ?? badge.textContent ?? "").match(/\d+/);
                if (m) unread = parseInt(m[0], 10);
              }
              return { name, time, preview, unread };
            })
            .filter((c) => c.name),
        )
        .catch(() => [] as RecentChat[]);

      for (const c of batch) {
        if (!byName.has(c.name)) byName.set(c.name, c);
        if (byName.size >= limit) break;
      }

      if (byName.size >= limit) break;
      if (byName.size === before) stale++;
      else stale = 0;
      await page
        .locator("#pane-side")
        .evaluate((el) => el.scrollBy(0, Math.round(el.clientHeight * 0.85)))
        .catch(() => {});
      await page.waitForTimeout(600);
    }

    const list = [...byName.values()].slice(0, limit);
    log.info(`Found ${list.length} recent chat(s).`);
    return list;
  },
};
