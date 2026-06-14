/**
 * Erreurs typees de la librairie. Permet au consommateur de distinguer
 * un probleme d'auth, un checkpoint, un selecteur casse, etc.
 */

export class SocialConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Session invalide / expiree et pas de reconnexion possible. */
export class NotLoggedInError extends SocialConnectorError {}

/** Le provider demande une verification (captcha, 2FA, QR non scanne...). */
export class CheckpointError extends SocialConnectorError {}

/** Un selecteur attendu est introuvable — l'UI du provider a probablement change. */
export class SelectorError extends SocialConnectorError {}

/** La publication / l'envoi n'a pas pu etre confirme. */
export class PostFailedError extends SocialConnectorError {}

/** Provider inconnu / non supporte. */
export class UnknownProviderError extends SocialConnectorError {}
