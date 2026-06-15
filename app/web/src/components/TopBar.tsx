import { Provider } from "../api.js";
import { ProviderIcon } from "./ProviderIcon.js";

interface Props {
  title: string;
  subtitle?: string;
  providers: Provider[];
}

const PROVIDER_CLASS: Record<string, string> = {
  facebook: "fb",
  linkedin: "li",
  whatsapp: "wa",
};

export function TopBar({ title, subtitle, providers }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{title}</span>
        {subtitle && <span className="topbar-subtitle">{subtitle}</span>}
      </div>
      <div className="topbar-right">
        {providers.map((p) => {
          const cls = PROVIDER_CLASS[p.id] ?? "";
          const connected = p.loggedIn;
          return (
            <div key={p.id} className={`provider-pill ${connected ? "connected" : ""} ${cls}`}>
              <ProviderIcon provider={p.id} size={14} />
              <span className="provider-pill-dot" />
            </div>
          );
        })}
      </div>
    </header>
  );
}
