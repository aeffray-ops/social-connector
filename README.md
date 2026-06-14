# facebook-connector

Librairie TypeScript pour se connecter à un compte Facebook et **publier un message sur son propre mur**, via un navigateur automatisé ([Playwright](https://playwright.dev)).

Tu donnes ton login/mot de passe **une seule fois** : la session (cookies) est sauvegardée sur disque et réutilisée ensuite — plus besoin de retaper les identifiants ni de repasser les vérifications de sécurité à chaque fois.

> ⚠️ **À lire avant d'utiliser**
> Automatiser Facebook **viole les Conditions d'utilisation de Meta**. Risques réels : déclenchement de captcha/2FA, blocage temporaire ou bannissement du compte. À n'utiliser que sur **ton propre compte**, à tes risques. Cette lib ne contourne aucune vérification : tout checkpoint t'est rendu pour résolution manuelle.

## Installation

```bash
npm install
npx playwright install chromium   # télécharge le navigateur
```

## Configuration

Copie `.env.example` en `.env` et remplis :

```ini
FB_EMAIL=ton.email@example.com
FB_PASSWORD=ton_mot_de_passe
FB_STATE_PATH=./fb-state.json   # optionnel
FB_HEADLESS=0                   # 0 = navigateur visible (recommandé au login)
```

`.env` et `fb-state.json` sont git-ignorés — ils ne seront jamais committés.

## Utilisation — CLI

```bash
# 1) Connexion (une fois). Si Facebook demande 2FA/captcha,
#    une fenêtre s'ouvre : tu la résous à la main, la lib attend.
npm run login

# 2) Publier sur le mur
npm run post -- "Mon premier message automatisé"

# Vérifier l'état de la session
npx tsx src/cli.ts status
```

La première fois, garde `FB_HEADLESS=0` pour pouvoir résoudre une éventuelle vérification de sécurité. Ensuite la session sauvée évite ces étapes.

## Utilisation — API

```typescript
import { FacebookConnector } from "facebook-connector";

const fb = new FacebookConnector({ statePath: "./fb-state.json" });

try {
  // Réutilise la session sauvée si valide, sinon se connecte avec les creds.
  if (!(await fb.isLoggedIn())) {
    await fb.login({ email: process.env.FB_EMAIL!, password: process.env.FB_PASSWORD! });
  }
  await fb.postToWall("Hello world 👋");
} finally {
  await fb.close();
}
```

### API publique

| Méthode | Description |
|---|---|
| `new FacebookConnector(opts?)` | `statePath`, `headless`, `slowMo`, `locale` |
| `login(creds, opts?)` | Connexion. Réutilise la session si valide ; gère un checkpoint manuel. |
| `isLoggedIn()` | `true` si une session sauvée est valide. |
| `postToWall(text, opts?)` | Publie `text` sur le mur. `opts.screenshotPath` pour debug. |
| `close()` | Ferme le navigateur. |

### Erreurs typées

`NotLoggedInError`, `CheckpointError`, `InvalidCredentialsError`, `SelectorError`, `PostFailedError` — toutes dérivent de `FacebookConnectorError`.

## Architecture

```
FacebookConnector (façade)
├── BrowserSession   → cycle de vie Playwright + persistance storageState
├── AuthManager      → détection login, saisie creds, gestion checkpoint
└── WallPoster       → ouvre le composer, tape le texte, publie
selectors.ts         → tous les sélecteurs DOM (POINT FRAGILE — à patcher si l'UI change)
dom.ts               → helpers tolérants (essaie plusieurs sélecteurs candidats)
```

## Limites & maintenance

- **Sélecteurs fragiles** : Facebook change son DOM souvent. Si une action casse → `SelectorError` avec la liste des sélecteurs essayés. Corrige `src/selectors.ts`.
- **Localisation** : les `aria-label` dépendent de la langue du compte. Les sélecteurs couvrent FR + EN ; ajoute ta langue au besoin.
- **Pas de contournement** : captcha/2FA restent manuels (par design).

## Scripts

```bash
npm run build       # compile TS -> dist/
npm run typecheck   # vérifie les types sans émettre
npm run dev         # lance la CLI via tsx
```
