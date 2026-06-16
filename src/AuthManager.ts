import type { Page } from "playwright";
import { BrowserSession } from "./BrowserSession.js";
import type { Logger } from "./logger.js";
import type { ProviderAuthConfig } from "./types.js";
import { anyVisible, firstVisible } from "./dom.js";
import { NotLoggedInError } from "./errors.js";

export interface ManualLoginOptions {
  /** Max wait time for the manual login (ms). Default: 5 min. */
  timeoutMs?: number;
}

/**
 * Manages the authentication state, driven by a provider's config.
 *
 * Login is done ONLY by hand (auto-typing is detected/blocked by the
 * providers). The session (cookies) is then saved and reused.
 */
export class AuthManager {
  private readonly log: Logger;
  constructor(
    private readonly session: BrowserSession,
    private readonly cfg: ProviderAuthConfig,
  ) {
    this.log = session.logger;
  }

  /** Navigates to the home page and detects whether the session is already valid. */
  async isLoggedIn(): Promise<boolean> {
    const page = this.session.page;
    this.log.step("Checking session...");
    await page.goto(this.cfg.homeUrl, { waitUntil: "domcontentloaded" });
    await this.dismissCookieBanner(page);

    const loggedInTimeout = this.cfg.loggedInTimeoutMs ?? 5000;
    if (await anyVisible(page, this.cfg.loggedInMarkers, loggedInTimeout)) {
      this.log.info("Valid session: already logged in.");
      return true;
    }
    // URL fallback: a logged-in URL (e.g. LinkedIn /feed/) with no login form
    // present means we're in, even if the DOM markers have drifted.
    if (this.matchesLoggedInUrl(page) && !(await anyVisible(page, this.cfg.loggedOutMarkers, 1500))) {
      this.log.info("Valid session: logged-in URL.");
      return true;
    }
    if (await anyVisible(page, this.cfg.loggedOutMarkers, 2000)) {
      this.log.info("Not logged in.");
      return false;
    }
    const ok = await anyVisible(page, this.cfg.loggedInMarkers, 3000);
    this.log.info(ok ? "Valid session." : "Ambiguous state -> assumed not logged in.");
    return ok;
  }

  /**
   * 100% MANUAL login: opens the login page (or the QR) and waits for the
   * user to log in themselves in the window, then saves the session.
   */
  async waitForManualLogin(opts: ManualLoginOptions = {}): Promise<void> {
    const timeoutMs = opts.timeoutMs ?? 300_000;

    if (await this.isLoggedIn()) {
      this.log.step("Already logged in — nothing to do.");
      return;
    }

    const page = this.session.page;
    this.log.step("Opening the login page...");
    await page.goto(this.cfg.loginUrl, { waitUntil: "domcontentloaded" });
    await this.dismissCookieBanner(page);

    process.stdout.write(
      "\n========================================================\n" +
        ">>> LOG IN MANUALLY in the window.\n" +
        ">>> (credentials + 2FA, or scan the QR for WhatsApp)\n" +
        `>>> Waiting up to ${Math.round(timeoutMs / 1000)}s...\n` +
        "========================================================\n",
    );

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const byMarker = await firstVisible(page, this.cfg.loggedInMarkers, 1000);
      // URL fallback: once the browser reaches a logged-in URL (e.g. /feed/),
      // the login is done even if the DOM markers never matched.
      const byUrl = !byMarker && this.matchesLoggedInUrl(page);
      if (byMarker || byUrl) {
        this.log.step(`Login detected (${byMarker ? "marker" : "url"}) — saving the session.`);
        await this.session.saveState();
        return;
      }
      await page.waitForTimeout(1500);
    }
    throw new NotLoggedInError(
      "Manual login not completed within the allotted time. Re-run and log in.",
    );
  }

  /** True if the page URL matches the provider's logged-in URL pattern. */
  private matchesLoggedInUrl(page: Page): boolean {
    if (!this.cfg.loggedInUrlPattern) return false;
    try {
      return new RegExp(this.cfg.loggedInUrlPattern, "i").test(page.url());
    } catch {
      return false;
    }
  }

  private async dismissCookieBanner(page: Page): Promise<void> {
    if (!this.cfg.cookieAccept?.length) return;
    const btn = await firstVisible(page, this.cfg.cookieAccept, 4000);
    if (!btn) return;
    this.log.info("Cookie banner detected -> accepting.");
    await btn.click().catch(() => {});
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!(await anyVisible(page, this.cfg.cookieAccept, 500))) return;
      await page.waitForTimeout(250);
    }
  }
}
