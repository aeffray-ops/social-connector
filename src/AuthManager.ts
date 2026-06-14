import type { Page } from "playwright";
import { BrowserSession } from "./BrowserSession.js";
import type { Logger } from "./logger.js";
import type { ProviderAuthConfig } from "./types.js";
import { anyVisible, firstVisible } from "./dom.js";
import { NotLoggedInError } from "./errors.js";

export interface ManualLoginOptions {
  /** Delai max d'attente de la connexion manuelle (ms). Defaut: 5 min. */
  timeoutMs?: number;
}

/**
 * Gere l'etat d'authentification, pilote par la config d'un provider.
 *
 * La connexion se fait UNIQUEMENT a la main (saisie auto detectee/bloquee par
 * les providers). La session (cookies) est ensuite sauvee et reutilisee.
 */
export class AuthManager {
  private readonly log: Logger;
  constructor(
    private readonly session: BrowserSession,
    private readonly cfg: ProviderAuthConfig,
  ) {
    this.log = session.logger;
  }

  /** Navigue vers l'accueil et detecte si la session est deja valide. */
  async isLoggedIn(): Promise<boolean> {
    const page = this.session.page;
    this.log.step("Verification de la session...");
    await page.goto(this.cfg.homeUrl, { waitUntil: "domcontentloaded" });
    await this.dismissCookieBanner(page);

    if (await anyVisible(page, this.cfg.loggedInMarkers, 5000)) {
      this.log.info("Session valide : deja connecte.");
      return true;
    }
    if (await anyVisible(page, this.cfg.loggedOutMarkers, 2000)) {
      this.log.info("Non connecte.");
      return false;
    }
    const ok = await anyVisible(page, this.cfg.loggedInMarkers, 3000);
    this.log.info(ok ? "Session valide." : "Etat ambigu -> considere non connecte.");
    return ok;
  }

  /**
   * Login 100% MANUEL : ouvre la page de connexion (ou le QR) et attend que
   * l'utilisateur se connecte lui-meme dans la fenetre, puis sauve la session.
   */
  async waitForManualLogin(opts: ManualLoginOptions = {}): Promise<void> {
    const timeoutMs = opts.timeoutMs ?? 300_000;

    if (await this.isLoggedIn()) {
      this.log.step("Deja connecte — rien a faire.");
      return;
    }

    const page = this.session.page;
    this.log.step("Ouverture de la page de connexion...");
    await page.goto(this.cfg.loginUrl, { waitUntil: "domcontentloaded" });
    await this.dismissCookieBanner(page);

    process.stdout.write(
      "\n========================================================\n" +
        ">>> CONNECTE-TOI MANUELLEMENT dans la fenetre.\n" +
        ">>> (identifiants + 2FA, ou scan du QR pour WhatsApp)\n" +
        `>>> J'attends jusqu'a ${Math.round(timeoutMs / 1000)}s...\n` +
        "========================================================\n",
    );

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await firstVisible(page, this.cfg.loggedInMarkers, 1000)) {
        this.log.step("Connexion detectee — sauvegarde de la session.");
        await this.session.saveState();
        return;
      }
      await page.waitForTimeout(1500);
    }
    throw new NotLoggedInError(
      "Login manuel non termine dans le delai imparti. Relance et connecte-toi.",
    );
  }

  private async dismissCookieBanner(page: Page): Promise<void> {
    if (!this.cfg.cookieAccept?.length) return;
    const btn = await firstVisible(page, this.cfg.cookieAccept, 4000);
    if (!btn) return;
    this.log.info("Bandeau cookies detecte -> acceptation.");
    await btn.click().catch(() => {});
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!(await anyVisible(page, this.cfg.cookieAccept, 500))) return;
      await page.waitForTimeout(250);
    }
  }
}
