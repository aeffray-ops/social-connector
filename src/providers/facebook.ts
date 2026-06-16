import type { Page } from "playwright";
import { collectPosts, firstVisible, requireVisible, waitGone } from "../dom.js";
import { PostFailedError } from "../errors.js";
import type { Logger } from "../logger.js";
import type { SocialProvider } from "../types.js";

/**
 * Facebook — posts text to the wall (home feed).
 * FR + EN selectors, tolerant. FRAGILE SPOT: patch if the UI changes.
 */

const COMPOSER_TRIGGER = [
  '[role="button"][aria-label="Créer une publication"]',
  '[role="button"][aria-label="Create a post"]',
  'div[role="button"]:has-text("Quoi de neuf")',
  'div[role="button"]:has-text("What\'s on your mind")',
];

const COMPOSER_INPUT = [
  // Composer-specific first (its own aria-label) so we never type into a
  // Messenger chat box, which is also a contenteditable dialog.
  'div[role="dialog"] div[contenteditable="true"][aria-label^="Quoi de neuf"]',
  'div[role="dialog"] div[contenteditable="true"][aria-label^="What\'s on your mind"]',
  'div[aria-label="Quoi de neuf ?"][contenteditable="true"]',
  'div[aria-label^="What\'s on your mind"][contenteditable="true"]',
  'div[role="dialog"] div[contenteditable="true"][role="textbox"]',
  'div[role="dialog"] div[contenteditable="true"]',
];

// Facebook's composer is now a 2-STEP flow: type → "Suivant"/"Next" → then
// "Publier"/"Post". Some accounts still publish in one step. Messenger dialogs
// never carry these exact labels, so scoping by aria-label is safe.
const NEXT_BUTTON = [
  'div[role="dialog"] [role="button"][aria-label="Suivant"]',
  'div[role="dialog"] [role="button"][aria-label="Next"]',
];

const PUBLISH_BUTTON = [
  'div[role="dialog"] [role="button"][aria-label="Publier"]',
  'div[role="dialog"] [role="button"][aria-label="Post"]',
  'div[role="dialog"] div[aria-label="Publier"][role="button"]',
  'div[role="dialog"] div[aria-label="Post"][role="button"]',
];

/**
 * Drives the composer to publish. Handles both the single-step ("Publier"
 * right away) and the two-step ("Suivant"/"Next" then "Publier") variants:
 * try to publish; if only a Next button is present, click it and retry. The
 * action buttons can be briefly aria-disabled until the text registers.
 */
async function advanceAndPublish(page: Page, log: Logger): Promise<boolean> {
  for (let step = 0; step < 3; step++) {
    const publish = await firstVisible(page, PUBLISH_BUTTON, step === 0 ? 2500 : 6000);
    if (publish) {
      if ((await publish.getAttribute("aria-disabled").catch(() => null)) === "true") {
        await page.waitForTimeout(800);
      }
      await publish.scrollIntoViewIfNeeded().catch(() => {});
      await publish.click();
      return true;
    }
    const next = await firstVisible(page, NEXT_BUTTON, 3000);
    if (!next) return false;
    if ((await next.getAttribute("aria-disabled").catch(() => null)) === "true") {
      await page.waitForTimeout(1000);
    }
    await next.scrollIntoViewIfNeeded().catch(() => {});
    await next.click().catch(() => {});
    log.step("Composer: moving to the next step…");
    await page.waitForTimeout(1500);
  }
  return false;
}

export const facebook: SocialProvider = {
  id: "facebook",
  label: "Facebook",
  defaultUserDataDir: "./.fb-profile",
  auth: {
    homeUrl: "https://www.facebook.com/",
    loginUrl: "https://www.facebook.com/login.php",
    loggedInMarkers: [
      '[aria-label="Votre profil"]',
      '[aria-label="Your profile"]',
      '[aria-label="Compte"]',
      '[aria-label="Account"]',
      'div[role="navigation"][aria-label="Raccourcis du compte"]',
      'div[role="navigation"][aria-label="Account Controls and Settings"]',
    ],
    loggedOutMarkers: ["input#email", 'input[name="email"]', 'form[action*="login"]'],
    cookieAccept: [
      '[data-cookiebanner="accept_button"]',
      'button[data-testid="cookie-policy-manage-dialog-accept-button"]',
      '[role="button"][aria-label="Autoriser tous les cookies"]',
      '[role="button"][aria-label="Allow all cookies"]',
      'div[aria-label="Autoriser tous les cookies"]',
      'div[aria-label="Allow all cookies"]',
    ],
  },

  async post({ page, content, options, log }) {
    log.step("Loading the home feed...");
    await page.goto("https://www.facebook.com/", { waitUntil: "domcontentloaded" });

    log.step("Opening the composer (What's on your mind?)...");
    const trigger = await requireVisible(page, COMPOSER_TRIGGER, "Facebook composer", 12000);
    await trigger.click();
    const input = await requireVisible(page, COMPOSER_INPUT, "composer modal", 10000);

    log.step("Typing the text...");
    await input.click();
    await input.type(content, { delay: 15 });

    if (options.screenshotPath) {
      await page.screenshot({ path: options.screenshotPath }).catch(() => {});
      log.info(`Screenshot: ${options.screenshotPath}`);
    }

    log.step("Publishing (Facebook's multi-step composer)...");
    if (!(await advanceAndPublish(page, log))) {
      throw new PostFailedError(
        'Facebook "Publish" button not found. The composer may have changed — ' +
          "update NEXT_BUTTON/PUBLISH_BUTTON in src/providers/facebook.ts.",
      );
    }

    // Confirm via the composer closing — more reliable than watching the
    // button, whose markup FB rewrites often.
    const confirmed =
      (await waitGone(page, COMPOSER_INPUT, 20000)) ||
      (await waitGone(page, PUBLISH_BUTTON, 5000));
    if (!confirmed) {
      throw new PostFailedError(
        "Facebook post not confirmed (composer stayed open).",
      );
    }
    log.step("Post confirmed.");
  },

  async readPosts({ page, options, log }) {
    const limit = options.limit ?? 10;
    log.step("Opening your profile (facebook.com/me)...");
    await page.goto("https://www.facebook.com/me", { waitUntil: "domcontentloaded" });
    // Give the timeline a moment to hydrate its first feed units.
    await page.waitForTimeout(2000);

    // After /me redirects, the URL is the user's own profile. Derive the
    // identifier so we can keep only posts they authored — the timeline also
    // surfaces activity (comments on friends' posts) we must skip.
    let me = "";
    try {
      const u = new URL(page.url());
      me = u.pathname.includes("profile.php")
        ? u.searchParams.get("id") ?? ""
        : u.pathname.replace(/\//g, "");
    } catch {
      /* keep me empty -> only the comment filter applies */
    }
    log.info(me ? `Profile id: ${me}` : "Profile id unknown — author filter relaxed.");

    log.step(`Collecting up to ${limit} of your own post(s)...`);
    return collectPosts(page, {
      limit,
      log,
      maxStale: 14,
      // FRAGILE: profile timeline feed units. Patch if the DOM changes.
      unit: 'div[role="article"]',
      text: '[data-ad-preview="message"], div[data-ad-comet-preview="message"], div[dir="auto"]',
      url: 'a[href*="/posts/"], a[href*="story_fbid="], a[href*="/permalink/"]',
      time: 'a[role="link"] span[aria-label], abbr',
      // Keep only authored posts: a /posts/ (or /videos/) permalink owned by
      // the user, never a comment (comment_id) or someone else's story.
      keep: (p) => {
        if (!p.url) return false;
        if (p.url.includes("comment_id=")) return false;
        if (!me) return /\/posts\/|\/videos\/|story_fbid=/.test(p.url);
        return (
          p.url.includes(`/${me}/posts/`) ||
          p.url.includes(`/${me}/videos/`) ||
          (p.url.includes("story_fbid=") && p.url.includes(`id=${me}`))
        );
      },
    });
  },
};
