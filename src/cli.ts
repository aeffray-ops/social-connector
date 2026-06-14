#!/usr/bin/env node
import { existsSync } from "node:fs";
import { SocialConnector } from "./SocialConnector.js";
import { SocialConnectorError } from "./errors.js";
import { PROVIDERS } from "./providers/index.js";
import type { ProviderId } from "./types.js";

/**
 * CLI multi-provider. Connexion TOUJOURS manuelle (fenetre visible).
 *
 *   social-connector login   --provider facebook
 *   social-connector login   --provider whatsapp           # scan QR
 *   social-connector post    --provider facebook "Hello mur"
 *   social-connector post    --provider whatsapp --to 33612345678 "Salut"
 *   social-connector status  --provider linkedin
 */

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

/** Extrait --flag/-f valeurs et renvoie {flags, positionals}. */
function parseArgs(argv: string[]): {
  provider?: string;
  to?: string;
  screenshot?: string;
  positionals: string[];
} {
  const out: { provider?: string; to?: string; screenshot?: string; positionals: string[] } = {
    positionals: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider" || a === "-p") out.provider = argv[++i];
    else if (a === "--to" || a === "-t") out.to = argv[++i];
    else if (a === "--screenshot") out.screenshot = argv[++i];
    else out.positionals.push(a!);
  }
  return out;
}

function resolveProvider(flag?: string): ProviderId {
  const id = flag ?? process.env.PROVIDER;
  if (!id) {
    throw new SocialConnectorError(
      `Provider requis : --provider <${Object.keys(PROVIDERS).join("|")}>`,
    );
  }
  if (!(id in PROVIDERS)) {
    throw new SocialConnectorError(
      `Provider inconnu "${id}". Disponibles: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }
  return id as ProviderId;
}

function makeConnector(provider: ProviderId, forceHeaded = false): SocialConnector {
  return new SocialConnector(provider, {
    statePath: process.env.STATE_PATH,
    headless: forceHeaded ? false : bool(process.env.HEADLESS, false),
  });
}

async function main(): Promise<void> {
  loadEnv();
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  switch (cmd) {
    case "login": {
      const fb = makeConnector(resolveProvider(args.provider), true);
      try {
        await fb.login();
        console.log("[OK] Connecte. Session sauvegardee.");
      } finally {
        await fb.close();
      }
      break;
    }

    case "post": {
      const provider = resolveProvider(args.provider);
      const text = args.positionals.join(" ").trim();
      if (!text) {
        console.error('Usage: post --provider <id> [--to <num>] "ton message"');
        process.exit(1);
      }
      const fb = makeConnector(provider);
      try {
        if (!(await fb.isLoggedIn())) {
          console.error(
            `[ERREUR] Pas de session ${provider}. Lance d'abord:  login --provider ${provider}`,
          );
          process.exit(1);
        }
        await fb.post(text, { target: args.to, screenshotPath: args.screenshot });
        console.log("[OK] Message publie/envoye.");
      } finally {
        await fb.close();
      }
      break;
    }

    case "status": {
      const fb = makeConnector(resolveProvider(args.provider));
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
          "social-connector — publie/envoie sur plusieurs reseaux (login manuel).",
          "",
          `Providers: ${Object.keys(PROVIDERS).join(", ")}`,
          "",
          "Commandes:",
          "  login  --provider <id>                 Ouvre une fenetre, connexion manuelle, sauve la session",
          '  post   --provider <id> [--to <num>] "msg"   Publie (FB/LinkedIn) ou envoie (WhatsApp --to)',
          "  status --provider <id>                 Indique si une session valide existe",
          "",
          "Config (.env): STATE_PATH, HEADLESS (0=visible, 1=headless), PROVIDER (defaut)",
        ].join("\n"),
      );
      if (cmd && cmd !== "help") process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof SocialConnectorError) {
    console.error(`[ERREUR] ${err.name}: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
