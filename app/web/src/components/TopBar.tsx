import { useEffect, useState } from "react";
import { Provider, UsageByModel, getHubUsage, getRelayUsage } from "../api.js";
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

/* Prix indicatifs Anthropic, en $ par million de tokens (estimation). */
const PRICE: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-8": { in: 15, out: 75 },
  "gpt-4o": { in: 2.5, out: 10 },
};
const PRICE_DEFAULT = { in: 3, out: 15 };

function costOf(byModel: UsageByModel): number {
  let c = 0;
  for (const [model, t] of Object.entries(byModel)) {
    const p = PRICE[model] ?? PRICE_DEFAULT;
    c += (t.input / 1e6) * p.in + (t.output / 1e6) * p.out;
  }
  return c;
}
function tokensOf(byModel: UsageByModel): number {
  return Object.values(byModel).reduce((s, t) => s + t.input + t.output, 0);
}
function fmtTok(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1e6) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1e6).toFixed(2)}M`;
}
function fmtCost(c: number): string {
  if (c <= 0) return "$0";
  if (c < 1) return `$${c.toFixed(3)}`;
  return `$${c.toFixed(2)}`;
}

function ConsumptionBadge() {
  const [hub, setHub] = useState<UsageByModel>({});
  const [relay, setRelay] = useState<UsageByModel>({});

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [h, r] = await Promise.all([
        getHubUsage().then((d) => d.by_model ?? {}).catch(() => ({} as UsageByModel)),
        getRelayUsage().then((d) => d.byModel ?? {}).catch(() => ({} as UsageByModel)),
      ]);
      if (!alive) return;
      setHub(h);
      setRelay(r);
    };
    void tick();
    const id = setInterval(() => void tick(), 12000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const hubCost = costOf(hub);
  const relayCost = costOf(relay);
  const total = hubCost + relayCost;
  const totalTok = tokensOf(hub) + tokensOf(relay);

  const tip =
    `Consommation IA (estimation, prix Anthropic)\n` +
    `• Génération : ${fmtCost(hubCost)} — ${fmtTok(tokensOf(hub))} tokens\n` +
    `• Assistant : ${fmtCost(relayCost)} — ${fmtTok(tokensOf(relay))} tokens`;

  return (
    <div
      title={tip}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        marginRight: 10,
        border: "1px solid var(--border)",
        borderRadius: 999,
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        cursor: "default",
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="#F5B800" stroke="#F5B800" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
      </svg>
      <span style={{ fontWeight: 600 }}>≈ {fmtCost(total)}</span>
      <span style={{ color: "var(--muted)" }}>· {fmtTok(totalTok)} tok</span>
    </div>
  );
}

export function TopBar({ title, subtitle, providers }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <span className="topbar-title">{title}</span>
        {subtitle && <span className="topbar-subtitle">{subtitle}</span>}
      </div>
      <div className="topbar-right">
        <ConsumptionBadge />
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
