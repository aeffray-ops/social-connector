/**
 * Exemple multi-provider.
 *   npx tsx examples/post.ts facebook "Hello mur"
 *   npx tsx examples/post.ts linkedin "Hello feed"
 *   npx tsx examples/post.ts whatsapp "Salut" 33612345678
 *
 * Connexion manuelle : si pas de session valide, une fenetre s'ouvre et tu te
 * connectes a la main (ou scan QR pour WhatsApp). La session est reutilisee.
 */
import { SocialConnector, type ProviderId } from "../src/index.js";

const [providerArg, message, target] = process.argv.slice(2);
const provider = (providerArg ?? "facebook") as ProviderId;

const fb = new SocialConnector(provider, { headless: false });

try {
  await fb.login();
  await fb.post(message ?? "Hello depuis social-connector !", { target });
  console.log(`Publie sur ${provider}.`);
} finally {
  await fb.close();
}
