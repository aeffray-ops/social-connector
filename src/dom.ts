import type { Page, Locator } from "playwright";
import { SelectorError } from "./errors.js";

/**
 * Helpers DOM tolerants : on essaie une LISTE de selecteurs candidats et on
 * prend le premier qui matche un element visible. Absorbe les variations de
 * langue / DOM de Facebook (voir selectors.ts).
 */

/** Retourne le premier locator visible parmi les candidats, ou null. */
export async function firstVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs = 8000,
): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;
  // Petit polling : Facebook hydrate son DOM en plusieurs temps.
  while (Date.now() < deadline) {
    for (const sel of selectors) {
      const loc = page.locator(sel).first();
      try {
        if (await loc.isVisible()) return loc;
      } catch {
        // selecteur invalide pour cette page — on continue
      }
    }
    await page.waitForTimeout(250);
  }
  return null;
}

/** Comme firstVisible mais leve SelectorError si rien trouve. */
export async function requireVisible(
  page: Page,
  selectors: readonly string[],
  label: string,
  timeoutMs = 8000,
): Promise<Locator> {
  const loc = await firstVisible(page, selectors, timeoutMs);
  if (!loc) {
    throw new SelectorError(
      `Element introuvable: "${label}". Selecteurs essayes:\n  - ${selectors.join(
        "\n  - ",
      )}\nL'UI Facebook a probablement change — mets a jour src/selectors.ts.`,
    );
  }
  return loc;
}

/** Vrai si au moins un des selecteurs est present (visible) rapidement. */
export async function anyVisible(
  page: Page,
  selectors: readonly string[],
  timeoutMs = 3000,
): Promise<boolean> {
  return (await firstVisible(page, selectors, timeoutMs)) !== null;
}
