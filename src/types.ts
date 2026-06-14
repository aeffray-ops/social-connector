import type { Page } from "playwright";
import type { Logger } from "./logger.js";

export type ProviderId = "facebook" | "whatsapp" | "linkedin";

/**
 * Config d'authentification d'un provider. L'auth est toujours manuelle :
 * on a juste besoin de savoir ou aller et comment reconnaitre l'etat loggue.
 */
export interface ProviderAuthConfig {
  /** Page d'accueil (etat connecte attendu). */
  homeUrl: string;
  /** Page de connexion (ou QR pour WhatsApp). */
  loginUrl: string;
  /** Selecteurs presents UNIQUEMENT si connecte. */
  loggedInMarkers: readonly string[];
  /** Selecteurs presents UNIQUEMENT si deconnecte. */
  loggedOutMarkers: readonly string[];
  /** Bouton d'acceptation des cookies, si le provider en affiche un. */
  cookieAccept?: readonly string[];
}

export interface PostOptions {
  /**
   * Destinataire. Requis pour WhatsApp (numero international, ex "33612345678").
   * Ignore par les providers qui publient sur un mur/feed (Facebook, LinkedIn).
   */
  target?: string;
  /** Capture d'ecran avant envoi/publication (chemin). Debug. */
  screenshotPath?: string;
}

/** Contexte passe a l'action post() d'un provider. */
export interface PostContext {
  page: Page;
  content: string;
  options: PostOptions;
  log: Logger;
}

/** Un provider = config d'auth + une action de publication specifique. */
export interface SocialProvider {
  id: ProviderId;
  /** Nom lisible (logs, CLI). */
  label: string;
  /** Fichier de session par defaut. */
  defaultStatePath: string;
  auth: ProviderAuthConfig;
  /** Action de publication / envoi, propre au provider. */
  post(ctx: PostContext): Promise<void>;
}
