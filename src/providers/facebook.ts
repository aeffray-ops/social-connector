import { requireVisible, waitGone } from "../dom.js";
import { PostFailedError } from "../errors.js";
import type { SocialProvider } from "../types.js";

/**
 * Facebook — publie un texte sur le mur (fil d'accueil).
 * Selecteurs FR + EN, tolerants. POINT FRAGILE : a patcher si l'UI change.
 */

const COMPOSER_TRIGGER = [
  '[role="button"][aria-label="Créer une publication"]',
  '[role="button"][aria-label="Create a post"]',
  'div[role="button"]:has-text("Quoi de neuf")',
  'div[role="button"]:has-text("What\'s on your mind")',
];

const COMPOSER_INPUT = [
  'div[role="dialog"] div[contenteditable="true"][role="textbox"]',
  'div[role="dialog"] div[contenteditable="true"]',
  'div[aria-label="Quoi de neuf ?"][contenteditable="true"]',
  'div[aria-label^="What\'s on your mind"][contenteditable="true"]',
];

const PUBLISH_BUTTON = [
  'div[role="dialog"] div[aria-label="Publier"][role="button"]',
  'div[role="dialog"] div[aria-label="Post"][role="button"]',
  'div[role="dialog"] [aria-label="Publier"]',
  'div[role="dialog"] [aria-label="Post"]',
];

export const facebook: SocialProvider = {
  id: "facebook",
  label: "Facebook",
  defaultStatePath: "./fb-state.json",
  auth: {
    homeUrl: "https://www.facebook.com/",
    loginUrl: "https://www.facebook.com/login.php",
    loggedInMarkers: [
      '[aria-label="Votre profil"]',
      '[aria-label="Your profile"]',
      '[aria-label="Compte"]',
      '[aria-label="Account"]',
      'div[role="navigation"][aria-label="Raccourcis du compte"]',
      'div[role="navigation"][aria-label="Account Controls and Settings"]',
    ],
    loggedOutMarkers: ["input#email", 'input[name="email"]', 'form[action*="login"]'],
    cookieAccept: [
      '[data-cookiebanner="accept_button"]',
      'button[data-testid="cookie-policy-manage-dialog-accept-button"]',
      '[role="button"][aria-label="Autoriser tous les cookies"]',
      '[role="button"][aria-label="Allow all cookies"]',
      'div[aria-label="Autoriser tous les cookies"]',
      'div[aria-label="Allow all cookies"]',
    ],
  },

  async post({ page, content, options, log }) {
    log.step("Chargement du fil d'accueil...");
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });

    log.step("Ouverture du composer (Quoi de neuf ?)...");
    const trigger = await requireVisible(page, COMPOSER_TRIGGER, "composer Facebook", 12000);
    await trigger.click();
    const input = await requireVisible(page, COMPOSER_INPUT, "modale composer", 10000);

    log.step("Saisie du texte...");
    await input.click();
    await input.type(content, { delay: 15 });

    if (options.screenshotPath) {
      await page.screenshot({ path: options.screenshotPath }).catch(() => {});
      log.info(`Capture : ${options.screenshotPath}`);
    }

    log.step("Clic sur Publier...");
    const publish = await requireVisible(page, PUBLISH_BUTTON, "bouton Publier");
    await publish.click();

    if (!(await waitGone(page, PUBLISH_BUTTON, 20000))) {
      throw new PostFailedError(
        "Publication Facebook non confirmee (modale restee ouverte).",
      );
    }
    log.step("Publication confirmee.");
  },
};
