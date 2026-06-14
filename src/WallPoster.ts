import type { Page } from "playwright";
import { BrowserSession } from "./BrowserSession.js";
import { firstVisible, requireVisible } from "./dom.js";
import { PostFailedError } from "./errors.js";
import {
  COMPOSER_INPUT,
  COMPOSER_TRIGGER,
  PUBLISH_BUTTON,
  URLS,
} from "./selectors.js";

export interface PostOptions {
  /** Capture d'ecran avant publication (chemin). Utile pour debug. */
  screenshotPath?: string;
}

/**
 * Action metier : publier un texte sur le mur (fil d'accueil) du compte loggue.
 *
 * Flux : accueil -> clic "Quoi de neuf ?" -> saisie texte dans la modale ->
 * clic "Publier" -> attente de fermeture de la modale (confirmation).
 */
export class WallPoster {
  constructor(private readonly session: BrowserSession) {}

  async post(text: string, opts: PostOptions = {}): Promise<void> {
    if (!text.trim()) throw new PostFailedError("Texte vide.");

    const page = this.session.page;
    await page.goto(URLS.home, { waitUntil: "domcontentloaded" });

    await this.openComposer(page);
    const input = await requireVisible(page, COMPOSER_INPUT, "zone de texte du composer");
    await input.click();
    // type() simule une frappe reelle (plus naturel que fill()).
    await input.type(text, { delay: 15 });

    if (opts.screenshotPath) {
      await page.screenshot({ path: opts.screenshotPath }).catch(() => {});
    }

    const publish = await requireVisible(page, PUBLISH_BUTTON, "bouton Publier");
    await publish.click();

    await this.waitForPublished(page);
  }

  private async openComposer(page: Page): Promise<void> {
    const trigger = await requireVisible(
      page,
      COMPOSER_TRIGGER,
      "declencheur du composer (Quoi de neuf ?)",
      12000,
    );
    await trigger.click();
    // La modale (role=dialog) doit apparaitre.
    await requireVisible(page, COMPOSER_INPUT, "modale composer ouverte", 10000);
  }

  /** La modale qui se ferme = publication acceptee. */
  private async waitForPublished(page: Page): Promise<void> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const stillOpen = await firstVisible(page, PUBLISH_BUTTON, 800);
      if (!stillOpen) return; // modale fermee -> succes
      await page.waitForTimeout(500);
    }
    throw new PostFailedError(
      "Publication non confirmee : la modale est restee ouverte (20s). " +
        "Verifie le compte ou mets a jour les selecteurs.",
    );
  }
}
