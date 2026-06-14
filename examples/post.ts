/**
 * Exemple d'utilisation programmatique.
 * Lance avec :  npx tsx examples/post.ts "Mon message"
 *
 * Identifiants lus depuis les variables d'env FB_EMAIL / FB_PASSWORD
 * (ou un fichier .env charge par `node --env-file=.env`).
 */
import { FacebookConnector } from "../src/index.js";

const message = process.argv.slice(2).join(" ") || "Hello depuis facebook-connector !";

const fb = new FacebookConnector({ statePath: "./fb-state.json", headless: false });

try {
  // Login : reutilise la session sauvee si valide, sinon utilise les creds.
  if (!(await fb.isLoggedIn())) {
    await fb.login({
      email: process.env.FB_EMAIL!,
      password: process.env.FB_PASSWORD!,
    });
  }

  await fb.postToWall(message);
  console.log("Publie:", message);
} finally {
  await fb.close();
}
