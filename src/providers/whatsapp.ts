import { firstVisible, requireVisible, waitGone } from "../dom.js";
import { PostFailedError } from "../errors.js";
import type { SocialProvider } from "../types.js";

/**
 * WhatsApp Web — envoie un message a un contact.
 *
 * Login = scan du QR code (manuel, comme les autres : aucune saisie auto).
 * L'action exige options.target = numero international SANS '+' ni espaces
 * (ex "33612345678"). On ouvre l'URL `send?phone=...&text=...` qui pre-remplit
 * le message, puis on l'envoie.
 *
 * Selecteurs NON verifies sans login reel : a patcher au premier SelectorError.
 */

const MESSAGE_BOX = [
  'footer div[contenteditable="true"][role="textbox"]',
  'div[aria-label="Saisissez un message"][contenteditable="true"]',
  'div[aria-label="Type a message"][contenteditable="true"]',
  'footer div[contenteditable="true"]',
];

const SEND_BUTTON = [
  'button[aria-label="Envoyer"]',
  'button[aria-label="Send"]',
  'span[data-icon="send"]',
];

const INVALID_NUMBER_DIALOG = [
  'div[role="dialog"]:has-text("invalide")',
  'div[role="dialog"]:has-text("invalid")',
  'div[role="dialog"]:has-text("URL invalide")',
];

export const whatsapp: SocialProvider = {
  id: "whatsapp",
  label: "WhatsApp",
  defaultStatePath: "./wa-state.json",
  auth: {
    homeUrl: "https://web.whatsapp.com/",
    loginUrl: "https://web.whatsapp.com/",
    loggedInMarkers: [
      'div[aria-label="Liste des discussions"]',
      'div[aria-label="Chat list"]',
      '[data-icon="new-chat-outline"]',
      'div[title="Nouvelle discussion"]',
      "#side",
    ],
    loggedOutMarkers: [
      'canvas[aria-label*="Scan"]',
      "div[data-ref]",
      '[data-icon="intro-md-beta-logo-dark"]',
      'div:has-text("pour vous connecter")',
    ],
    // WhatsApp Web n'affiche pas de bandeau cookies.
  },

  async post({ page, content, options, log }) {
    const phone = (options.target ?? "").replace(/[^0-9]/g, "");
    if (!phone) {
      throw new PostFailedError(
        "WhatsApp : 'target' requis (numero international sans '+', ex 33612345678).",
      );
    }

    log.step(`Ouverture de la discussion avec ${phone}...`);
    const url = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(content)}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Numero invalide / non inscrit ?
    if (await firstVisible(page, INVALID_NUMBER_DIALOG, 4000)) {
      throw new PostFailedError(
        `WhatsApp : numero ${phone} invalide ou non inscrit sur WhatsApp.`,
      );
    }

    log.step("Attente de la zone de message...");
    const box = await requireVisible(page, MESSAGE_BOX, "zone de message WhatsApp", 30000);
    await box.click();

    if (options.screenshotPath) {
      await page.screenshot({ path: options.screenshotPath }).catch(() => {});
      log.info(`Capture : ${options.screenshotPath}`);
    }

    log.step("Envoi du message...");
    // Le texte est deja pre-rempli via l'URL. On envoie (bouton, sinon Entree).
    const send = await firstVisible(page, SEND_BUTTON, 4000);
    if (send) await send.click();
    else await page.keyboard.press("Enter");

    // Confirmation best-effort : la zone de message se vide apres envoi.
    await waitGone(page, SEND_BUTTON, 8000);
    log.step("Message envoye.");
  },
};
