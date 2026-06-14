/**
 * Erreurs typees de la librairie. Permet au consommateur de distinguer
 * un probleme d'auth, un checkpoint Facebook, un selecteur casse, etc.
 */

export class FacebookConnectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Session invalide / expiree et impossible de se reconnecter automatiquement. */
export class NotLoggedInError extends FacebookConnectorError {}

/** Facebook demande une verification (captcha, 2FA, validation d'appareil). */
export class CheckpointError extends FacebookConnectorError {}

/** Identifiants refuses par Facebook. */
export class InvalidCredentialsError extends FacebookConnectorError {}

/** Un selecteur attendu est introuvable — l'UI Facebook a probablement change. */
export class SelectorError extends FacebookConnectorError {}

/** La publication n'a pas pu etre confirmee. */
export class PostFailedError extends FacebookConnectorError {}
