import { UnknownProviderError } from "../errors.js";
import type { ProviderId, SocialProvider } from "../types.js";
import { facebook } from "./facebook.js";
import { whatsapp } from "./whatsapp.js";
import { linkedin } from "./linkedin.js";

/** Registre des providers supportes. */
export const PROVIDERS: Record<ProviderId, SocialProvider> = {
  facebook,
  whatsapp,
  linkedin,
};

export function getProvider(id: string): SocialProvider {
  const p = (PROVIDERS as Record<string, SocialProvider>)[id];
  if (!p) {
    throw new UnknownProviderError(
      `Provider inconnu: "${id}". Disponibles: ${Object.keys(PROVIDERS).join(", ")}.`,
    );
  }
  return p;
}

export { facebook, whatsapp, linkedin };
