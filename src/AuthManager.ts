import type { Page } from "playwright";
import { BrowserSession } from "./BrowserSession.js";
import { anyVisible, firstVisible, requireVisible } from "./dom.js";
import {
  CheckpointError,
  InvalidCredentialsError,
  NotLoggedInError,
} from "./errors.js";
import {
  CHECKPOINT_MARKERS,
  LOGGED_IN_MARKERS,
  LOGGED_OUT_MARKERS,
  LOGIN,
  URLS,
} from "./selectors.js";

export interface Credentials {
  email: string;
  password: string;
}

export interface LoginOptions {
  /**
   * Si Facebook demande une verification (2FA, captcha, validation device),
   * attendre que l'utilisateur la resolve manuellement dans le navigateur.
   * Defaut: true. Mettre false en CI / headless.
   */
  waitForManualCheckpoint?: boolean;
  /** Delai max d'attente d'une resolution manuelle (ms). Defaut: 3 min. */
  manualCheckpointTimeoutMs?: number;
}

/**
 * Gere l'etat d'authentification.
 *
 * Strategie : la session sauvegardee (cookies) est la source de verite. On ne
 * saisit les identifiants que si la session est absente/expiree. Tout
 * checkpoint Facebook est remonte a l'utilisateur (jamais contourne).
 */
export class AuthManager {
  constructor(private readonly session: BrowserSession) {}

  /** Navigue vers l'accueil et detecte si la session est deja valide. */
  async isLoggedIn(): Promise<boolean> {
    const page = this.session.page;
    await page.goto(URLS.home, { waitUntil: "domcontentloaded" });
    await this.dismissCookieBanner(page);

    if (await anyVisible(page, LOGGED_IN_MARKERS, 5000)) return true;
    if (await anyVisible(page, LOGGED_OUT_MARKERS, 2000)) return false;
    // Ambigu : on retente une fois les markers loggue.
    return anyVisible(page, LOGGED_IN_MARKERS, 3000);
  }

  /**
   * S'assure d'etre connecte. Si deja loggue via session : ne fait rien.
   * Sinon saisit les identifiants, gere un eventuel checkpoint, puis sauve
   * la nouvelle session.
   */
  async ensureLoggedIn(
    creds: Credentials,
    opts: LoginOptions = {},
  ): Promise<void> {
    if (await this.isLoggedIn()) return;

    const page = this.session.page;
    await page.goto(URLS.login, { waitUntil: "domcontentloaded" });
    await this.dismissCookieBanner(page);

    await this.fillCredentials(page, creds);

    // Apres soumission : soit on est loggue, soit checkpoint, soit erreur creds.
    await this.resolvePostLogin(page, opts);

    if (!(await this.isLoggedIn())) {
      throw new NotLoggedInError(
        "Connexion echouee : etat non-loggue apres soumission du formulaire.",
      );
    }

    await this.session.saveState();
  }

  private async fillCredentials(page: Page, creds: Credentials): Promise<void> {
    const email = await requireVisible(page, LOGIN.email, "champ email");
    await email.fill(creds.email);

    const password = await requireVisible(page, LOGIN.password, "champ mot de passe");
    await password.fill(creds.password);

    const submit = await requireVisible(page, LOGIN.submit, "bouton de connexion");
    await Promise.all([
      page.waitForLoadState("domcontentloaded").catch(() => {}),
      submit.click(),
    ]);
    await page.waitForTimeout(2000);
  }

  private async resolvePostLogin(page: Page, opts: LoginOptions): Promise<void> {
    // Identifiants refuses ?
    if (await anyVisible(page, LOGIN.password, 1500)) {
      const errorText = await page
        .locator('div[role="alert"], #error_box')
        .first()
        .innerText()
        .catch(() => "");
      throw new InvalidCredentialsError(
        `Identifiants probablement refuses par Facebook.${
          errorText ? ` Message: ${errorText}` : ""
        }`,
      );
    }

    // Checkpoint (2FA / captcha / validation device) ?
    if (await anyVisible(page, CHECKPOINT_MARKERS, 1500)) {
      const wait = opts.waitForManualCheckpoint ?? true;
      if (!wait) {
        throw new CheckpointError(
          "Facebook demande une verification (2FA/captcha) et le mode manuel est desactive.",
        );
      }
      await this.waitForManualCheckpoint(
        page,
        opts.manualCheckpointTimeoutMs ?? 180_000,
      );
    }
  }

  /** Attend que l'utilisateur resolve le checkpoint dans le navigateur visible. */
  private async waitForManualCheckpoint(page: Page, timeoutMs: number): Promise<void> {
    process.stdout.write(
      "\n[facebook-connector] Verification Facebook detectee (2FA / captcha).\n" +
        "  -> Resous-la manuellement dans la fenetre du navigateur.\n" +
        `  -> J'attends jusqu'a ${Math.round(timeoutMs / 1000)}s...\n`,
    );
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await firstVisible(page, LOGGED_IN_MARKERS, 1000)) return;
      await page.waitForTimeout(1000);
    }
    throw new CheckpointError(
      "Checkpoint non resolu dans le delai imparti. Relance et termine la verification.",
    );
  }

  private async dismissCookieBanner(page: Page): Promise<void> {
    const btn = await firstVisible(page, LOGIN.cookieAccept, 2500);
    if (btn) await btn.click().catch(() => {});
  }
}
