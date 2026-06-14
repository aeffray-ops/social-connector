import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface BrowserSessionOptions {
  /** Chemin du fichier storageState (cookies + localStorage). */
  statePath: string;
  /** Navigateur sans interface. Defaut: false (visible). */
  headless?: boolean;
  /** Ralentit chaque action (ms) — utile pour debug visuel. */
  slowMo?: number;
  /** Locale du navigateur. Defaut: fr-FR. */
  locale?: string;
}

/**
 * Gere le cycle de vie Playwright et la persistance de la session.
 *
 * Une seule responsabilite : ouvrir un navigateur, charger l'etat sauvegarde
 * s'il existe, exposer une Page, et savoir re-sauver l'etat sur disque.
 */
export class BrowserSession {
  private browser?: Browser;
  private context?: BrowserContext;
  private pageInstance?: Page;

  constructor(private readonly opts: BrowserSessionOptions) {}

  /** True si un fichier de session existe deja sur disque. */
  hasSavedState(): boolean {
    return existsSync(this.opts.statePath);
  }

  /** Lance le navigateur et cree un contexte (avec etat sauvegarde si dispo). */
  async start(): Promise<Page> {
    if (this.pageInstance) return this.pageInstance;

    this.browser = await chromium.launch({
      headless: this.opts.headless ?? false,
      slowMo: this.opts.slowMo,
    });

    const storageState =
      this.hasSavedState() && (await this.readState()) !== null
        ? this.opts.statePath
        : undefined;

    this.context = await this.browser.newContext({
      storageState,
      locale: this.opts.locale ?? "fr-FR",
      // User-agent realiste pour limiter la detection bot.
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    });

    this.pageInstance = await this.context.newPage();
    return this.pageInstance;
  }

  get page(): Page {
    if (!this.pageInstance) {
      throw new Error("BrowserSession non demarree — appelle start() d'abord.");
    }
    return this.pageInstance;
  }

  /** Sauve l'etat courant (cookies + storage) dans statePath. */
  async saveState(): Promise<void> {
    if (!this.context) return;
    await mkdir(dirname(this.opts.statePath), { recursive: true }).catch(() => {});
    await this.context.storageState({ path: this.opts.statePath });
  }

  /** Lit le fichier d'etat, ou null s'il est absent / corrompu. */
  private async readState(): Promise<unknown | null> {
    try {
      return JSON.parse(await readFile(this.opts.statePath, "utf8"));
    } catch {
      return null;
    }
  }

  /** Ferme proprement le navigateur. */
  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.pageInstance = undefined;
    this.context = undefined;
    this.browser = undefined;
  }
}
