import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { NOOP_LOGGER, type Logger } from "./logger.js";

export interface BrowserSessionOptions {
  /**
   * Directory of the persistent browser profile. Unlike a storageState
   * file, this keeps the FULL profile on disk: cookies, localStorage,
   * IndexedDB, cache and service workers. Lets slow providers (WhatsApp
   * Web) reuse their cached chats instead of re-syncing on every launch.
   */
  userDataDir: string;
  /** Headless browser. Default: true (hidden). */
  headless?: boolean;
  /** Slows down each action (ms) — useful for visual debugging. */
  slowMo?: number;
  /** Browser locale. Default: fr-FR. */
  locale?: string;
  /**
   * Browser channel to launch. A REAL installed browser ("chrome" / "msedge")
   * is far less likely to trip Google's "this browser may not be secure"
   * block than Playwright's bundled Chromium. Default: try chrome, then
   * msedge, then the bundled Chromium. Pass an explicit value to force one.
   */
  channel?: "chrome" | "msedge" | "chromium";
  /** Progress logger. Default: silent. */
  logger?: Logger;
}

/** Launch order when no channel is forced: real browsers first, bundled last. */
const CHANNEL_FALLBACK: Array<"chrome" | "msedge" | undefined> = [
  "chrome",
  "msedge",
  undefined, // bundled Chromium
];

/**
 * Manages the Playwright lifecycle and session persistence.
 *
 * Uses a persistent context (a real on-disk browser profile) so the whole
 * session — including IndexedDB and cache — survives between runs. Single
 * responsibility: open the browser on that profile and expose a Page.
 */
export class BrowserSession {
  private context?: BrowserContext;
  private pageInstance?: Page;
  private readonly log: Logger;

  constructor(private readonly opts: BrowserSessionOptions) {
    this.log = opts.logger ?? NOOP_LOGGER;
  }

  /** Launches the browser on the persistent profile and returns its page. */
  async start(): Promise<Page> {
    if (this.pageInstance) return this.pageInstance;

    await mkdir(this.opts.userDataDir, { recursive: true }).catch(() => {});
    this.log.step(
      `Launching the browser (headless=${this.opts.headless ?? false})...`,
    );

    // Common options. Note: NO spoofed user-agent. A real Chrome/Edge already
    // sends a coherent UA; a fake one (e.g. macOS while running on Windows)
    // is itself a bot-detection signal. We also strip Playwright's automation
    // flags, which is what makes Google show "this browser may not be secure".
    const common = {
      headless: this.opts.headless ?? false,
      slowMo: this.opts.slowMo,
      locale: this.opts.locale ?? "fr-FR",
      viewport: { width: 1280, height: 900 },
      args: ["--disable-blink-features=AutomationControlled"],
      ignoreDefaultArgs: ["--enable-automation"],
    };

    const channels: Array<"chrome" | "msedge" | undefined> = this.opts.channel
      ? [this.opts.channel === "chromium" ? undefined : this.opts.channel]
      : CHANNEL_FALLBACK;

    let lastErr: unknown;
    for (const channel of channels) {
      try {
        this.context = await chromium.launchPersistentContext(this.opts.userDataDir, {
          ...common,
          ...(channel ? { channel } : {}),
        });
        this.log.info(`Browser engine: ${channel ?? "bundled chromium"}`);
        break;
      } catch (e) {
        lastErr = e;
        this.log.info(`Channel "${channel ?? "chromium"}" unavailable — trying next…`);
      }
    }
    if (!this.context) {
      throw new Error(
        `Could not launch any browser (tried: ${channels
          .map((c) => c ?? "chromium")
          .join(", ")}). Last error: ${(lastErr as Error)?.message ?? lastErr}`,
      );
    }
    this.log.info(`Persistent profile: ${this.opts.userDataDir}`);

    // Extra stealth: hide the webdriver flag some sites probe via JS.
    await this.context
      .addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      })
      .catch(() => {});

    this.pageInstance = this.context.pages()[0] ?? (await this.context.newPage());
    this.log.info("Browser ready.");
    return this.pageInstance;
  }

  get logger(): Logger {
    return this.log;
  }

  get page(): Page {
    if (!this.pageInstance) {
      throw new Error("BrowserSession not started — call start() first.");
    }
    return this.pageInstance;
  }

  /**
   * No-op flush: a persistent context writes its state to disk continuously,
   * so there is nothing extra to save. Kept for API compatibility.
   */
  async saveState(): Promise<void> {
    this.log.info(`Session persisted in ${this.opts.userDataDir}`);
  }

  /** Cleanly closes the browser (flushes the profile to disk). */
  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    this.pageInstance = undefined;
    this.context = undefined;
  }
}
