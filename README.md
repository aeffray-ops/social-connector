# social-connector

**Multi-provider** TypeScript library (Facebook, WhatsApp, LinkedIn) to post/send a message via an automated browser ([Playwright](https://playwright.dev)).

Same principle for all providers: login is **manual** (they block automated login). A window opens, you log in yourself **once** (or scan the QR for WhatsApp), then the session (cookies) is saved **per provider** and reused.

| Provider | `post()` action | `target` required | `read()` |
|---|---|---|---|
| `facebook` | Posts to the wall | no | yes (own wall posts) |
| `linkedin` | Posts to the feed | no | yes (own activity) |
| `whatsapp` | Sends a message to a contact, group or community | **yes** — `--to <number>` (contact) or `--chat <name>` (group/community) | no |

> ⚠️ Automating these platforms **violates their Terms of Service**. Risk: captcha/2FA, blocking, ban. Use only on **your own accounts**, at your own risk. No verification is bypassed.

## Installation

```bash
npm install                       # also builds dist/ via the prepare script
npx playwright install chromium
npm link                          # installs the `social-connector` command globally
```

After `npm link`, the `social-connector` binary is on your PATH. Rebuild
(`npm run build`) after changing the source. Skip `npm link` and use
`npx tsx src/cli.ts ...` if you prefer running from source.

## Usage — CLI

`social-connector <command> [provider] [options]`. Run `-h` for help.

```bash
social-connector -h                  # full help
social-connector post -h             # command help
social-connector --version

# 1) MANUAL login (once per provider). Always opens a visible window.
social-connector login facebook
social-connector login whatsapp      # scan the QR
social-connector login linkedin

# 2) Post / send (reuses the session). Chromium hidden by default.
social-connector post facebook "Hello my wall"
social-connector post linkedin "Hello my feed"
social-connector post whatsapp --to 33612345678 "Hi!"

# WhatsApp group / community announcement group, by name (experimental)
social-connector post whatsapp --chat "My community - Announcements" "Hi all!"

# List your WhatsApp groups (handy to copy an exact name for --chat)
social-connector groups whatsapp
social-connector groups whatsapp --json

# Natural-language WhatsApp via an LLM (experimental). Backend = OpenAI by
# default (OPENAI_API_KEY), or Anthropic (AI_PROVIDER=anthropic + ANTHROPIC_API_KEY).
# The LLM composes the message, resolves the group name, then asks to confirm.
social-connector ai "écris dans le groupe Team Updates que la réu est demain à 9h"
social-connector ai "envoie à Maman que j'arrive vers 20h" --yes   # skip confirmation

# Show Chromium for a run (debug): -s / --show / --headed
social-connector post whatsapp --to 33612345678 "Hi!" --show

# Read your own posts (Facebook, LinkedIn). Default 10, --json for machine output.
social-connector read facebook
social-connector read linkedin --limit 5
social-connector read facebook --json | jq '.[].text'

# Session status
social-connector status facebook
```

> The provider can be the first argument (`post facebook "..."`), or `--provider facebook`, or the `PROVIDER` env var.
> The `npm run login:fb` / `post` / `status` scripts still work for running without a global install.

**Auto-login:** action commands (`post`, `read`, `groups`, `chats`, `conversation`, `ai`) open a visible login window automatically when no valid session exists, then continue once you've logged in. Pass `--no-login` to error out instead (useful for non-interactive scripts).

## Web UI (experimental)

A local React UI for the whole library — broadcast one message to several providers at once, plus sessions/login, reading, and the AI agent.

### Install

```bash
npm run app:install
```

### Development

```bash
npm run app:dev
```

Then open http://127.0.0.1:5173 (Vite proxies `/api` to the server on `:3001`).

### Production

```bash
npm run app:build && npm run app:start
```

Then open http://127.0.0.1:3001.

### Notes

- **Localhost-only**: binds `127.0.0.1`, no auth — it controls logged-in social accounts.
- Reuses the same env as the CLI: `USER_DATA_DIR`, `HEADLESS`, `OPENAI_API_KEY`/`ANTHROPIC_API_KEY`/`AI_PROVIDER`, `CACHE_PASSPHRASE`.

## Usage — API

```typescript
import { SocialConnector } from "social-connector";

// Facebook (wall)
const fb = new SocialConnector("facebook");
try {
  await fb.login();                       // manual if no session
  await fb.post("Hello world 👋");
} finally {
  await fb.close();
}

// WhatsApp (message to a contact)
const wa = new SocialConnector("whatsapp");
try {
  await wa.login();                       // scan the QR
  await wa.post("Hi!", { target: "33612345678" });
} finally {
  await wa.close();
}
```

### Public API

| Method | Description |
|---|---|
| `new SocialConnector(providerId, opts?)` | `providerId`: `facebook`\|`whatsapp`\|`linkedin`. `opts`: `userDataDir`, `headless` (default `true` = hidden), `slowMo`, `locale`, `verbose` |
| `login(opts?)` | **Manual** login. Reuses the session if valid. `opts.timeoutMs` |
| `isLoggedIn()` | `true` if a saved session is valid |
| `post(content, options?)` | Posts/sends. `options.target` (WhatsApp), `options.screenshotPath` |
| `read(options?)` | Reads your own posts → `Post[]`. `options.limit` (default 10). Facebook/LinkedIn only; throws `UnsupportedActionError` for WhatsApp |
| `listGroups(options?)` | Lists your group names → `string[]`. `options.limit` (0/omitted = all). WhatsApp only; throws `UnsupportedActionError` otherwise |
| `close()` | Closes the browser |

### Typed errors

`NotLoggedInError`, `CheckpointError`, `SelectorError`, `PostFailedError`, `UnknownProviderError`, `UnsupportedActionError` — derive from `SocialConnectorError`.

## Architecture

```
SocialConnector (facade, picks the provider)
├── BrowserSession   → Playwright lifecycle + persistent profile (cookies/IndexedDB/cache, per provider)
├── AuthManager      → session detection + waiting for manual login (driven by ProviderAuthConfig)
└── provider.post()  → provider-specific action
providers/
  facebook.ts        → wall   | whatsapp.ts → contact message | linkedin.ts → feed
  index.ts           → registry { facebook, whatsapp, linkedin }
types.ts             → SocialProvider, ProviderAuthConfig, PostOptions, PostContext
dom.ts               → tolerant helpers (firstVisible walks ALL matches)
```

### Adding a provider

Create `src/providers/<name>.ts` exporting a `SocialProvider` (`auth` + `post`), then register it in `src/providers/index.ts`. Nothing else to touch.

## Limits & maintenance

- **Fragile selectors**: each provider changes its DOM. A `SelectorError` lists the selectors tried → patch the relevant provider file.
- **Not verified without a real login**: WhatsApp/LinkedIn `post` selectors and LinkedIn logged-out markers. Adjust at the first real login.
- **WhatsApp**: `--to` = international number without `+` or spaces (e.g. `33612345678`).
- **WhatsApp groups/communities** (`--chat`, experimental): WhatsApp has no deep-link for groups, so the chat is opened by **searching its name** in the chat list. The name must be unique and exact (case/accents); a wrong match means messaging the wrong chat. A community's announcement group is usually **admin-only** — posting as a non-admin fails with a `SelectorError` (no message box).

## Scripts

```bash
npm run build       # compile TS -> dist/
npm run typecheck   # types without emitting
```
