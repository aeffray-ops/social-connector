#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync } from "node:fs";
import { FacebookConnector } from "./FacebookConnector.js";
import { FacebookConnectorError } from "./errors.js";

/**
 * CLI minimale.
 *
 *   facebook-connector login                 # se connecte (creds via .env ou prompt), sauve la session
 *   facebook-connector post "Mon message"    # publie sur le mur
 *   facebook-connector status                # dit si une session valide existe
 */

// Charge .env si present (Node >= 20.6).
function loadEnv(): void {
  if (existsSync(".env") && typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(".env");
    } catch {
      /* ignore */
    }
  }
}

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined) return def;
  return v === "1" || v.toLowerCase() === "true";
}

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (hidden) {
    // Masque la saisie (mot de passe).
    const orig = (rl as unknown as { _writeToOutput?: (s: string) => void })
      ._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
      () => {};
    const answer = await rl.question(question);
    if (orig)
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
        orig;
    stdout.write("\n");
    rl.close();
    return answer;
  }
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

async function getCredentials(): Promise<{ email: string; password: string }> {
  const email = process.env.FB_EMAIL ?? (await prompt("Email Facebook: "));
  const password =
    process.env.FB_PASSWORD ?? (await prompt("Mot de passe: ", true));
  if (!email || !password) {
    throw new FacebookConnectorError("Email et mot de passe requis.");
  }
  return { email, password };
}

function makeConnector(): FacebookConnector {
  return new FacebookConnector({
    statePath: process.env.FB_STATE_PATH ?? "./fb-state.json",
    headless: bool(process.env.FB_HEADLESS, false),
  });
}

async function main(): Promise<void> {
  loadEnv();
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "login": {
      const fb = makeConnector();
      try {
        const creds = await getCredentials();
        await fb.login(creds);
        console.log("[OK] Connecte. Session sauvegardee.");
      } finally {
        await fb.close();
      }
      break;
    }

    case "post": {
      const text = rest.join(" ").trim();
      if (!text) {
        console.error('Usage: facebook-connector post "ton message"');
        process.exit(1);
      }
      const fb = makeConnector();
      try {
        // Si une session existe deja, pas besoin de creds. Sinon on logge.
        if (!(await fb.isLoggedIn())) {
          console.log("Pas de session valide — connexion...");
          await fb.login(await getCredentials());
        }
        await fb.postToWall(text);
        console.log("[OK] Publie sur le mur.");
      } finally {
        await fb.close();
      }
      break;
    }

    case "status": {
      const fb = makeConnector();
      try {
        const ok = await fb.isLoggedIn();
        console.log(ok ? "[OK] Session valide." : "[--] Pas de session valide.");
      } finally {
        await fb.close();
      }
      break;
    }

    default:
      console.log(
        [
          "facebook-connector — publie sur ton mur Facebook.",
          "",
          "Commandes:",
          "  login                  Se connecte (creds via .env ou prompt) et sauve la session",
          '  post "message"         Publie un message sur le mur',
          "  status                 Indique si une session valide existe",
          "",
          "Config (.env): FB_EMAIL, FB_PASSWORD, FB_STATE_PATH, FB_HEADLESS",
        ].join("\n"),
      );
      if (cmd && cmd !== "help") process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof FacebookConnectorError) {
    console.error(`[ERREUR] ${err.name}: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
