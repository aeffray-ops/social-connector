import { BrowserSession } from "./BrowserSession.js";
import { AuthManager, type Credentials, type LoginOptions } from "./AuthManager.js";
import { WallPoster, type PostOptions } from "./WallPoster.js";
import { NotLoggedInError } from "./errors.js";

export interface FacebookConnectorOptions {
  /** Chemin du fichier de session sauvegardee. Defaut: ./fb-state.json */
  statePath?: string;
  /** Navigateur sans interface. Defaut: false (visible). */
  headless?: boolean;
  /** Ralentit les actions (ms) pour debug visuel. */
  slowMo?: number;
  /** Locale du navigateur. Defaut: fr-FR. */
  locale?: string;
}

/**
 * Facade publique de la librairie.
 *
 *   const fb = new FacebookConnector();
 *   await fb.login({ email, password });   // 1 fois — session sauvee ensuite
 *   await fb.postToWall("Mon message");
 *   await fb.close();
 */
export class FacebookConnector {
  private readonly session: BrowserSession;
  private readonly auth: AuthManager;
  private readonly poster: WallPoster;
  private started = false;

  constructor(opts: FacebookConnectorOptions = {}) {
    this.session = new BrowserSession({
      statePath: opts.statePath ?? "./fb-state.json",
      headless: opts.headless ?? false,
      slowMo: opts.slowMo,
      locale: opts.locale,
    });
    this.auth = new AuthManager(this.session);
    this.poster = new WallPoster(this.session);
  }

  /** Demarre le navigateur (idempotent). Appele automatiquement par login/post. */
  async start(): Promise<void> {
    if (this.started) return;
    await this.session.start();
    this.started = true;
  }

  /**
   * S'assure d'etre connecte. Reutilise la session sauvee si valide, sinon
   * saisit les identifiants (et gere un eventuel checkpoint manuel).
   */
  async login(creds: Credentials, opts?: LoginOptions): Promise<void> {
    await this.start();
    await this.auth.ensureLoggedIn(creds, opts);
  }

  /** Verifie une session deja sauvegardee, sans identifiants. */
  async isLoggedIn(): Promise<boolean> {
    await this.start();
    return this.auth.isLoggedIn();
  }

  /** Publie un texte sur le mur. Requiert une session valide (login prealable). */
  async postToWall(text: string, opts?: PostOptions): Promise<void> {
    await this.start();
    if (!(await this.auth.isLoggedIn())) {
      throw new NotLoggedInError(
        "Pas de session valide. Appelle login({ email, password }) d'abord.",
      );
    }
    await this.poster.post(text, opts);
  }

  /** Ferme le navigateur. A appeler en fin d'utilisation. */
  async close(): Promise<void> {
    await this.session.close();
    this.started = false;
  }
}
