import { requireVisible, waitGone } from "../dom.js";
import { PostFailedError } from "../errors.js";
import type { SocialProvider } from "../types.js";

/**
 * LinkedIn — publie un texte sur le feed.
 * Selecteurs FR + EN, tolerants. NON verifies sans login reel : a patcher au
 * premier SelectorError.
 */

const COMPOSER_TRIGGER = [
  'button:has-text("Commencer un post")',
  'button:has-text("Start a post")',
  ".share-box-feed-entry__trigger",
  'button[aria-label*="Commencer un post"]',
  'button[aria-label*="Start a post"]',
];

const COMPOSER_INPUT = [
  'div[role="dialog"] div[role="textbox"][contenteditable="true"]',
  "div[role=\"dialog\"] .ql-editor[contenteditable=\"true\"]",
  'div.ql-editor[contenteditable="true"]',
];

const PUBLISH_BUTTON = [
  'div[role="dialog"] button.share-actions__primary-action',
  'div[role="dialog"] button:has-text("Publier")',
  'div[role="dialog"] button:has-text("Post")',
];

export const linkedin: SocialProvider = {
  id: "linkedin",
  label: "LinkedIn",
  defaultStatePath: "./li-state.json",
  auth: {
    homeUrl: "https://www.linkedin.com/feed/",
    loginUrl: "https://www.linkedin.com/login",
    loggedInMarkers: [
      ".share-box-feed-entry__trigger",
      'button[aria-label*="Commencer un post"]',
      'button[aria-label*="Start a post"]',
      "#global-nav",
      'header[role="banner"] input[role="combobox"]',
    ],
    loggedOutMarkers: [
      "input#username",
      'input[name="session_key"]',
      "form.login__form",
      'a[href*="/login"]',
    ],
    cookieAccept: [
      'button[action-type="ACCEPT"]',
      'button[aria-label="Accepter"]',
      'button:has-text("Accepter")',
      'button:has-text("Accept")',
    ],
  },

  async post({ page, content, options, log }) {
    log.step("Chargement du feed LinkedIn...");
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });

    log.step("Ouverture du composer (Commencer un post)...");
    const trigger = await requireVisible(page, COMPOSER_TRIGGER, "composer LinkedIn", 12000);
    await trigger.click();
    const input = await requireVisible(page, COMPOSER_INPUT, "editeur LinkedIn", 10000);

    log.step("Saisie du texte...");
    await input.click();
    await input.type(content, { delay: 15 });

    if (options.screenshotPath) {
      await page.screenshot({ path: options.screenshotPath }).catch(() => {});
      log.info(`Capture : ${options.screenshotPath}`);
    }

    log.step("Clic sur Publier...");
    const publish = await requireVisible(page, PUBLISH_BUTTON, "bouton Publier LinkedIn");
    await publish.click();

    if (!(await waitGone(page, PUBLISH_BUTTON, 20000))) {
      throw new PostFailedError(
        "Publication LinkedIn non confirmee (modale restee ouverte).",
      );
    }
    log.step("Publication confirmee.");
  },
};
