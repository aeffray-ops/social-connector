# social-connector

Librairie TypeScript **multi-provider** (Facebook, WhatsApp, LinkedIn) pour publier/envoyer un message via un navigateur automatisé ([Playwright](https://playwright.dev)).

Même principe pour tous les providers : la connexion est **manuelle** (ils bloquent le login automatisé). Une fenêtre s'ouvre, tu te connectes toi-même **une seule fois** (ou scan du QR pour WhatsApp), puis la session (cookies) est sauvegardée **par provider** et réutilisée.

| Provider | Action `post()` | `target` requis |
|---|---|---|
| `facebook` | Publie sur le mur | non |
| `linkedin` | Publie sur le feed | non |
| `whatsapp` | Envoie un message à un contact | **oui** (numéro international) |

> ⚠️ Automatiser ces plateformes **viole leurs Conditions d'utilisation**. Risque : captcha/2FA, blocage, bannissement. À n'utiliser que sur **tes propres comptes**, à tes risques. Aucune vérification n'est contournée.

## Installation

```bash
npm install
npx playwright install chromium
```

## Utilisation — CLI

```bash
# 1) Connexion MANUELLE (une fois par provider). Fenêtre forcée visible.
npm run login:fb          # Facebook  (= login --provider facebook)
npm run login:wa          # WhatsApp  (scan du QR)
npm run login:li          # LinkedIn

# 2) Publier / envoyer (réutilise la session)
npm run post -- facebook "Hello mon mur"
npm run post -- linkedin "Hello mon feed"
npm run post -- whatsapp --to 33612345678 "Salut !"

# État de session
npm run status -- facebook
```

> `npm run post -- <provider> ...` passe `--provider <provider>` à la CLI.
> Forme directe : `npx tsx src/cli.ts post --provider whatsapp --to 33612345678 "Salut"`.

## Utilisation — API

```typescript
import { SocialConnector } from "social-connector";

// Facebook (mur)
const fb = new SocialConnector("facebook");
try {
  await fb.login();                       // manuel si pas de session
  await fb.post("Hello world 👋");
} finally {
  await fb.close();
}

// WhatsApp (message à un contact)
const wa = new SocialConnector("whatsapp");
try {
  await wa.login();                       // scan du QR
  await wa.post("Salut !", { target: "33612345678" });
} finally {
  await wa.close();
}
```

### API publique

| Méthode | Description |
|---|---|
| `new SocialConnector(providerId, opts?)` | `providerId`: `facebook`\|`whatsapp`\|`linkedin`. `opts`: `statePath`, `headless`, `slowMo`, `locale`, `verbose` |
| `login(opts?)` | Connexion **manuelle**. Réutilise la session si valide. `opts.timeoutMs` |
| `isLoggedIn()` | `true` si une session sauvée est valide |
| `post(content, options?)` | Publie/envoie. `options.target` (WhatsApp), `options.screenshotPath` |
| `close()` | Ferme le navigateur |

### Erreurs typées

`NotLoggedInError`, `CheckpointError`, `SelectorError`, `PostFailedError`, `UnknownProviderError` — dérivent de `SocialConnectorError`.

## Architecture

```
SocialConnector (façade, choisit le provider)
├── BrowserSession   → cycle de vie Playwright + persistance storageState (par provider)
├── AuthManager      → détection session + attente du login manuel (piloté par ProviderAuthConfig)
└── provider.post()  → action propre au provider
providers/
  facebook.ts        → mur    | whatsapp.ts → message contact | linkedin.ts → feed
  index.ts           → registre { facebook, whatsapp, linkedin }
types.ts             → SocialProvider, ProviderAuthConfig, PostOptions, PostContext
dom.ts               → helpers tolérants (firstVisible parcourt TOUS les matches)
```

### Ajouter un provider

Créer `src/providers/<nom>.ts` exportant un `SocialProvider` (`auth` + `post`), puis l'enregistrer dans `src/providers/index.ts`. Rien d'autre à toucher.

## Limites & maintenance

- **Sélecteurs fragiles** : chaque provider change son DOM. Un `SelectorError` liste les sélecteurs essayés → patche le fichier du provider concerné.
- **Non vérifiés sans login réel** : sélecteurs `post` de WhatsApp/LinkedIn et markers logged-out de LinkedIn. À ajuster au premier vrai login.
- **WhatsApp** : `target` = numéro international sans `+` ni espaces (ex `33612345678`).

## Scripts

```bash
npm run build       # compile TS -> dist/
npm run typecheck   # types sans émettre
```
