#!/usr/bin/env node
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { SocialConnector } from "./SocialConnector.js";
import { runAi } from "./ai.js";
import { SocialConnectorError } from "./errors.js";
import { PROVIDERS } from "./providers/index.js";
import type { Post, ProviderId } from "./types.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { name: string; version: string };
const BIN = "social-connector";
const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

/**
 * Multi-provider CLI. Login is ALWAYS manual (visible window).
 *
 *   social-connector login  whatsapp                       # scan QR
 *   social-connector post    facebook "Hello wall"
 *   social-connector post    whatsapp --to 33612345678 "Hi"
 *   social-connector status  linkedin
 *
 * The provider can be given as the first argument or via --provider.
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

interface Args {
  provider?: string;
  to?: string;
  chat?: string;
  screenshot?: string;
  show?: boolean;
  help?: boolean;
  limit?: number;
  since?: string;
  json?: boolean;
  yes?: boolean;
  positionals: string[];
}

/** Extracts --flag/-f values and returns {flags, positionals}. */
function parseArgs(argv: string[]): Args {
  const out: Args = { positionals: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--provider" || a === "-p") out.provider = argv[++i];
    else if (a === "--to" || a === "-t") out.to = argv[++i];
    else if (a === "--chat" || a === "-c") out.chat = argv[++i];
    else if (a === "--screenshot") out.screenshot = argv[++i];
    else if (a === "--limit" || a === "-n") out.limit = Number(argv[++i]);
    else if (a === "--since") out.since = argv[++i];
    else if (a === "--json") out.json = true;
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--show" || a === "--headed" || a === "-s") out.show = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else out.positionals.push(a!);
  }
  return out;
}

/** Pretty-prints scraped posts to stdout. */
function printPosts(posts: Post[]): void {
  if (posts.length === 0) {
    console.log("No posts found.");
    return;
  }
  posts.forEach((p, i) => {
    const head = `#${i + 1}${p.time ? `  ${p.time}` : ""}`;
    const body = p.text.length > 500 ? `${p.text.slice(0, 500)}…` : p.text;
    console.log(head);
    console.log(body.replace(/^/gm, "    "));
    if (p.url) console.log(`    ${p.url}`);
    console.log("");
  });
}

/**
 * Resolves the provider from --provider, or the first positional argument
 * if it names a known provider (then consumes it), or the PROVIDER env var.
 */
function takeProvider(args: Args): ProviderId {
  let id = args.provider;
  if (!id && args.positionals[0] && args.positionals[0] in PROVIDERS) {
    id = args.positionals.shift();
  }
  id = id ?? process.env.PROVIDER;
  if (!id) {
    throw new SocialConnectorError(
      `Provider required: pass it as the first argument or --provider <${PROVIDER_IDS.join("|")}>`,
    );
  }
  if (!(id in PROVIDERS)) {
    throw new SocialConnectorError(
      `Unknown provider "${id}". Available: ${PROVIDER_IDS.join(", ")}.`,
    );
  }
  return id as ProviderId;
}

/**
 * Resolve headless: hidden by default. A visible window is forced when
 * `--show` is passed, when the caller requires it (login/QR), or when
 * HEADLESS=0 is set in the env.
 */
function makeConnector(
  provider: ProviderId,
  { forceVisible = false, show = false }: { forceVisible?: boolean; show?: boolean } = {},
): SocialConnector {
  const visible = forceVisible || show || !bool(process.env.HEADLESS, true);
  return new SocialConnector(provider, {
    userDataDir: process.env.USER_DATA_DIR,
    headless: !visible,
  });
}

function generalHelp(): string {
  return [
    `${pkg.name} v${pkg.version} — post/send on several networks (manual login).`,
    "",
    `Usage: ${BIN} <command> [provider] [options]`,
    "",
    `Providers: ${PROVIDER_IDS.join(", ")}`,
    "",
    "Commands:",
    "  login   [provider]                     Open a window, log in by hand (or scan QR), save the session",
    '  post    [provider] [--to <num>] "msg"  Post (Facebook/LinkedIn) or send (WhatsApp, needs --to)',
    "  read    [provider] [--limit N]         Read your own posts (Facebook, LinkedIn)",
    "  groups  [provider] [--limit N]         List your groups (WhatsApp)",
    '  conversation --chat "name" [--limit N]  Read a WhatsApp conversation\'s recent messages',
    '  ai      "instruction"                  Natural-language WhatsApp via LLM (OpenAI or Anthropic key)',
    "  status  [provider]                     Print whether a valid session exists",
    "  help                                   Show this help",
    "",
    "Options:",
    "  -p, --provider <id>   Provider (else first arg, else PROVIDER env)",
    "  -t, --to <num>        WhatsApp contact: international number, no '+' (e.g. 33612345678)",
    '  -c, --chat <name>     WhatsApp group/community by name (overrides --to)',
    "  -n, --limit <N>       read/groups/conversation: max items to fetch",
    "      --since <date>    conversation: keep messages on/after YYYY-MM-DD (best-effort)",
    "      --json            read/groups/conversation: print as JSON instead of text",
    "  -y, --yes             ai: skip the confirmation prompt before sending",
    "  -s, --show, --headed  Show Chromium for this run (default: hidden). login is always visible.",
    "      --screenshot <p>  Save a screenshot before sending (debug)",
    "  -h, --help            Show help (use after a command for command help)",
    "  -v, --version         Print version",
    "",
    "Env (.env): USER_DATA_DIR, HEADLESS (1=hidden default, 0=visible), PROVIDER (default)",
    "",
    "Examples:",
    `  ${BIN} login whatsapp`,
    `  ${BIN} post facebook "Hello wall"`,
    `  ${BIN} post whatsapp --to 33612345678 "Hi!" --show`,
    `  ${BIN} post whatsapp --chat "My community - Announcements" "Hi all!"`,
    `  ${BIN} read linkedin --limit 5`,
    `  ${BIN} groups whatsapp`,
    `  ${BIN} ai "écris dans le groupe IDEAL CRM que la réu est demain à 9h"`,
    `  ${BIN} status linkedin`,
  ].join("\n");
}

function commandHelp(cmd: string): string {
  switch (cmd) {
    case "login":
      return [
        `Usage: ${BIN} login [provider]`,
        "",
        "Open a visible window and wait for you to log in by hand (or scan the QR",
        "for WhatsApp), then persist the session. Always visible, even with HEADLESS=1.",
        "",
        `Example: ${BIN} login whatsapp`,
      ].join("\n");
    case "post":
      return [
        `Usage: ${BIN} post [provider] [--to <num> | --chat <name>] [--show] "your message"`,
        "",
        "Post to the wall/feed (Facebook, LinkedIn) or send a message (WhatsApp).",
        "WhatsApp needs a destination:",
        "  --to <number>   a contact (international number without '+')",
        "  --chat <name>   a group or community announcement group, by name (overrides --to)",
        "",
        "Options: -t/--to, -c/--chat, -s/--show, --screenshot <path>",
        "",
        `Examples:`,
        `  ${BIN} post linkedin "Hello feed"`,
        `  ${BIN} post whatsapp --to 33612345678 "Hi!"`,
        `  ${BIN} post whatsapp --chat "My community - Announcements" "Hi all!"`,
      ].join("\n");
    case "read":
      return [
        `Usage: ${BIN} read [provider] [--limit N] [--json]`,
        "",
        "Read the logged-in user's own posts. Supported: Facebook (wall),",
        "LinkedIn (recent activity). Scrapes the profile, so it is best-effort",
        "and may need selector patches if the UI changes.",
        "",
        "Options: -n/--limit (default 10), --json, -s/--show",
        "",
        `Examples:`,
        `  ${BIN} read facebook`,
        `  ${BIN} read linkedin --limit 5 --json`,
      ].join("\n");
    case "groups":
      return [
        `Usage: ${BIN} groups [provider] [--limit N] [--json]`,
        "",
        "List the names of your WhatsApp groups (uses the in-app Groups filter).",
        "Use a name with `post --chat \"<name>\"` to message a group.",
        "",
        "Options: -n/--limit (0/omitted = all), --json, -s/--show",
        "",
        `Examples:`,
        `  ${BIN} groups whatsapp`,
        `  ${BIN} groups whatsapp --json`,
      ].join("\n");
    case "conversation":
      return [
        `Usage: ${BIN} conversation --chat "name" [--limit N] [--since YYYY-MM-DD] [--json]`,
        "",
        "Read the recent messages of one WhatsApp conversation (group or contact),",
        "by exact chat name. `--limit` caps how many messages (default 50);",
        "`--since` keeps messages on/after a date (best-effort).",
        "",
        `Example:`,
        `  ${BIN} conversation --chat "IDEAL CRM / OUTILS" --limit 30`,
      ].join("\n");
    case "ai":
      return [
        `Usage: ${BIN} ai [--yes] [--show] "your instruction"`,
        "",
        "Drive WhatsApp in natural language via an LLM (EXPERIMENTAL). It",
        "composes the message, resolves a fuzzy group name from your group list,",
        "and sends — after a y/N confirmation showing the exact target + text.",
        "",
        "Backend: OpenAI by default, Anthropic if AI_PROVIDER=anthropic or only",
        "ANTHROPIC_API_KEY is set. Needs OPENAI_API_KEY or ANTHROPIC_API_KEY",
        `(e.g. in .env). WhatsApp session must exist (run \`${BIN} login whatsapp\`).`,
        "",
        "Options: -y/--yes (skip confirmation), -s/--show",
        "",
        `Example:`,
        `  ${BIN} ai "écris dans le groupe IDEAL CRM que la réu est demain à 9h"`,
      ].join("\n");
    case "status":
      return [
        `Usage: ${BIN} status [provider]`,
        "",
        "Print whether a valid saved session exists for the provider.",
        "",
        `Example: ${BIN} status facebook`,
      ].join("\n");
    default:
      return generalHelp();
  }
}

async function main(): Promise<void> {
  loadEnv();
  const [cmd, ...rest] = process.argv.slice(2);

  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    console.log(generalHelp());
    return;
  }
  if (cmd === "-v" || cmd === "--version") {
    console.log(pkg.version);
    return;
  }

  const args = parseArgs(rest);
  if (args.help) {
    console.log(commandHelp(cmd));
    return;
  }

  switch (cmd) {
    case "login": {
      const fb = makeConnector(takeProvider(args), { forceVisible: true });
      try {
        await fb.login();
        console.log("[OK] Logged in. Session saved.");
      } finally {
        await fb.close();
      }
      break;
    }

    case "post": {
      const provider = takeProvider(args);
      const text = args.positionals.join(" ").trim();
      if (!text) {
        console.error(`Usage: ${BIN} post [provider] [--to <num>] "your message"`);
        process.exit(1);
      }
      const fb = makeConnector(provider, { show: args.show });
      try {
        if (!(await fb.isLoggedIn())) {
          console.error(
            `[ERROR] No ${provider} session. Run first:  ${BIN} login ${provider}`,
          );
          process.exit(1);
        }
        await fb.post(text, {
          target: args.to,
          chat: args.chat,
          screenshotPath: args.screenshot,
        });
        console.log("[OK] Message posted/sent.");
      } finally {
        await fb.close();
      }
      break;
    }

    case "status": {
      const fb = makeConnector(takeProvider(args), { show: args.show });
      try {
        const ok = await fb.isLoggedIn();
        console.log(ok ? "[OK] Valid session." : "[--] No valid session.");
      } finally {
        await fb.close();
      }
      break;
    }

    case "read": {
      const provider = takeProvider(args);
      const fb = makeConnector(provider, { show: args.show });
      try {
        // read() validates the session itself; no extra pre-check navigation.
        const posts = await fb.read({ limit: args.limit });
        if (args.json) console.log(JSON.stringify(posts, null, 2));
        else printPosts(posts);
      } finally {
        await fb.close();
      }
      break;
    }

    case "groups": {
      const fb = makeConnector(takeProvider(args), { show: args.show });
      try {
        const groups = await fb.listGroups({ limit: args.limit });
        if (args.json) console.log(JSON.stringify(groups, null, 2));
        else if (groups.length === 0) console.log("No groups found.");
        else groups.forEach((g, i) => console.log(`${i + 1}. ${g}`));
      } finally {
        await fb.close();
      }
      break;
    }

    case "conversation": {
      const chat = args.chat ?? args.positionals.join(" ").trim();
      if (!chat) {
        console.error(`Usage: ${BIN} conversation --chat "name" [--limit N] [--since YYYY-MM-DD]`);
        process.exit(1);
      }
      const fb = makeConnector("whatsapp", { show: args.show });
      try {
        const msgs = await fb.readConversation({ chat, limit: args.limit, since: args.since });
        if (args.json) console.log(JSON.stringify(msgs, null, 2));
        else if (msgs.length === 0) console.log("No messages found.");
        else msgs.forEach((m) => console.log(`[${m.time ?? "?"}] ${m.from}: ${m.text}`));
      } finally {
        await fb.close();
      }
      break;
    }

    case "ai": {
      const instruction = args.positionals.join(" ").trim();
      if (!instruction) {
        console.error(`Usage: ${BIN} ai "write in group X to say Y tomorrow at 9am"`);
        process.exit(1);
      }
      // AI layer is WhatsApp-only for now.
      const wa = makeConnector("whatsapp", { show: args.show });
      try {
        await runAi({ connector: wa, instruction, autoSend: args.yes });
      } finally {
        await wa.close();
      }
      break;
    }

    default:
      console.error(`Unknown command "${cmd}".\n`);
      console.log(generalHelp());
      process.exit(1);
  }
}

main().catch((err) => {
  if (err instanceof SocialConnectorError) {
    console.error(`[ERROR] ${err.name}: ${err.message}`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
