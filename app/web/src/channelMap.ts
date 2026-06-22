/**
 * Mapping canal Hub -> ProviderId Relay, par préfixe (contrat figé) :
 *   fb_* -> facebook, li_* -> linkedin, wa_* -> whatsapp.
 */
export type ProviderId = "facebook" | "whatsapp" | "linkedin";

export function canalToProvider(canal: string): ProviderId | null {
  if (canal.startsWith("fb_")) return "facebook";
  if (canal.startsWith("li_")) return "linkedin";
  if (canal.startsWith("wa_")) return "whatsapp";
  return null;
}
