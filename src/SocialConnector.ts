import { BrowserSession } from "./BrowserSession.js";
import { AuthManager, type ManualLoginOptions } from "./AuthManager.js";
import { createLogger } from "./logger.js";
import { getProvider } from "./providers/index.js";
import { NotLoggedInError } from "./errors.js";
import type { PostOptions, ProviderId, SocialProvider } from "./types.js";

export interface SocialConnectorOptions {
  /** Chemin du fichier de session. Defaut: celui du provider (ex ./fb-state.json). */
  statePath?: string;
  /** Navigateur sans interface. Defaut: false (visible). */
  headless?: boolean;
  /** Ralentit les actions (ms) pour debug visuel. */
  slowMo?: number;
  /** Locale du navigateur. Defaut: fr-FR. */
  locale?: string;
  /** Logs de progression (etapes + temps). Defaut: true. */
  verbose?: boolean;
}

/**
 * Facade publique multi-provider.
 *
 *   const fb = new SocialConnector("facebook");
 *   await fb.login();                       // login MANUEL (fenetre), 1 fois
 *   await fb.post("Hello mur !");
 *
 *   const wa = new SocialConnector("whatsapp");
 *   await wa.login();                       // scan du QR
 *   await wa.post("Salut !", { target: "33612345678" });
 *
 * La connexion est toujours manuelle. La session est sauvee par provider et
 * reutilisee.
 */
export class SocialConnector {
  private readonly provider: SocialProvider;
  private readonly session: BrowserSession;
  private readonly auth: AuthManager;
  private started = false;

  constructor(
    provider: ProviderId | SocialProvider,
    opts: SocialConnectorOptions = {},
  ) {
    this.provider = typeof provider === "string" ? getProvider(provider) : provider;
    const logger = createLogger(opts.verbose ?? true);
    this.session = new BrowserSession({
      statePath: opts.statePath ?? this.provider.defaultStatePath,
      headless: opts.headless ?? false,
      slowMo: opts.slowMo,
      locale: opts.locale,
      logger,
    });
    this.auth = new AuthManager(this.session, this.provider.auth);
  }

  /** Provider actif. */
  get providerId(): ProviderId {
    return this.provider.id;
  }

  /** Demarre le navigateur (idempotent). */
  async start(): Promise<void> {
    if (this.started) return;
    await this.session.start();
    this.started = true;
  }

  /** Connexion MANUELLE : reutilise la session sauvee, sinon attend le login a la main. */
  async login(opts?: ManualLoginOptions): Promise<void> {
    await this.start();
    await this.auth.waitForManualLogin(opts);
  }

  /** True si une session sauvee est valide. */
  async isLoggedIn(): Promise<boolean> {
    await this.start();
    return this.auth.isLoggedIn();
  }

  /**
   * Publie / envoie un message. Le sens depend du provider :
   * Facebook -> mur, LinkedIn -> feed, WhatsApp -> message a options.target.
   */
  async post(content: string, options: PostOptions = {}): Promise<void> {
    await this.start();
    if (!content.trim()) throw new Error("Contenu vide.");
    if (!(await this.auth.isLoggedIn())) {
      throw new NotLoggedInError(
        `Pas de session valide pour ${this.provider.label}. Lance d'abord login().`,
      );
    }
    await this.provider.post({
      page: this.session.page,
      content,
      options,
      log: this.session.logger,
    });
  }

  /** Ferme le navigateur. */
  async close(): Promise<void> {
    await this.session.close();
    this.started = false;
  }
}
