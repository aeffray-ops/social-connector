import { Provider } from "../api.js";
import { ProviderIcon } from "./ProviderIcon.js";

const PROVIDER_CLASS: Record<string, string> = {
  facebook: "fb",
  linkedin: "li",
  whatsapp: "wa",
};

interface Props {
  providers: Provider[];
  selected: Record<string, boolean>;
  onToggle: (id: string) => void;
}

/**
 * Network selection chips extracted verbatim from Broadcast. A disconnected
 * provider is shown disabled with a "Connect first" hint and cannot be toggled.
 */
export function ProviderPicker({ providers, selected, onToggle }: Props) {
  return (
    <div className="provider-chips">
      {providers.map((p) => {
        const connected = p.loggedIn;
        const isSelected = !!selected[p.id];
        const cls = PROVIDER_CLASS[p.id] ?? "";
        return (
          <button
            key={p.id}
            className={`chip ${cls} ${isSelected ? "chip-selected" : ""} ${
              !connected ? "chip-disabled" : ""
            }`}
            onClick={() => {
              if (!connected) return;
              onToggle(p.id);
            }}
            title={!connected ? `Connect ${p.label} first → Connections` : undefined}
          >
            <ProviderIcon provider={p.id} size={14} />
            {p.label}
            {!connected && (
              <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 2 }}>
                Connect first →
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
