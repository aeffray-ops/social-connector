/**
 * Selecteurs centralises — POINT FRAGILE #1.
 *
 * Facebook change son DOM regulierement et localise ses aria-label selon la
 * langue du compte. On garde donc plusieurs candidats par cible (FR + EN +
 * fallbacks generiques). Les helpers de `dom.ts` essaient chaque candidat dans
 * l'ordre jusqu'a en trouver un visible.
 *
 * Si la lib casse, c'est presque toujours ici qu'il faut intervenir.
 */

export const URLS = {
  base: "https://www.facebook.com",
  home: "https://www.facebook.com/",
  login: "https://www.facebook.com/login.php",
} as const;

/** Champs du formulaire de login. Stables historiquement (id=email / id=pass). */
export const LOGIN = {
  email: ["input#email", 'input[name="email"]', 'input[type="text"][name="email"]'],
  password: ["input#pass", 'input[name="pass"]', 'input[type="password"]'],
  submit: [
    'button[name="login"]',
    'button[type="submit"]',
    '[data-testid="royal_login_button"]',
  ],
  cookieAccept: [
    '[data-cookiebanner="accept_button"]',
    'button[data-testid="cookie-policy-manage-dialog-accept-button"]',
    'div[aria-label="Autoriser tous les cookies"]',
    'div[aria-label="Allow all cookies"]',
  ],
} as const;

/**
 * Indices qu'on est CONNECTE (presence = session valide).
 * On cherche des elements presents uniquement en etat loggue.
 */
export const LOGGED_IN_MARKERS = [
  '[aria-label="Votre profil"]',
  '[aria-label="Your profile"]',
  '[aria-label="Compte"]',
  '[aria-label="Account"]',
  'div[role="navigation"][aria-label="Raccourcis du compte"]',
  'div[role="navigation"][aria-label="Account Controls and Settings"]',
] as const;

/** Indices qu'on est DECONNECTE (presence = il faut se logguer). */
export const LOGGED_OUT_MARKERS = [
  "input#email",
  'input[name="email"]',
  'form[action*="login"]',
] as const;

/**
 * Indices d'un checkpoint / verification de securite Facebook.
 * (2FA, captcha, "C'est bien vous ?", validation d'appareil...)
 */
export const CHECKPOINT_MARKERS = [
  'form[action*="checkpoint"]',
  'input[name="approvals_code"]',
  '[name="approvals_code"]',
  "#captcha",
  'div[role="dialog"] input[autocomplete="one-time-code"]',
] as const;

/** Le composer "Quoi de neuf ?" sur le fil d'accueil (ouvre la modale). */
export const COMPOSER_TRIGGER = [
  '[aria-label="CrE9er une publication"]', // accent peut etre encode differemment
  'div[role="button"]:has-text("Quoi de neuf")',
  'div[role="button"]:has-text("What\'s on your mind")',
  'div[role="region"] div[role="button"]:has-text("Quoi de neuf")',
] as const;

/** La zone d'edition de texte dans la modale composer. */
export const COMPOSER_INPUT = [
  'div[role="dialog"] div[contenteditable="true"][role="textbox"]',
  'div[role="dialog"] div[contenteditable="true"]',
  'div[aria-label="Quoi de neuf ?"][contenteditable="true"]',
  'div[aria-label^="What\'s on your mind"][contenteditable="true"]',
] as const;

/** Le bouton "Publier" de la modale composer. */
export const PUBLISH_BUTTON = [
  'div[role="dialog"] div[aria-label="Publier"][role="button"]',
  'div[role="dialog"] div[aria-label="Post"][role="button"]',
  'div[role="dialog"] [aria-label="Publier"]',
  'div[role="dialog"] [aria-label="Post"]',
] as const;
