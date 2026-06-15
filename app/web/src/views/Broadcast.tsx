import { useEffect, useRef, useState } from "react";
import { postJSON, streamRun, Provider } from "../api.js";
import { ProviderIcon } from "../components/ProviderIcon.js";
import { Button } from "../components/Button.js";
import { Spinner } from "../components/Spinner.js";
import { useToast } from "../components/Toast.js";

interface Props {
  providers: Provider[];
}

type ProviderStatus = "pending" | "sending" | "sent" | "error";

interface ResultEntry {
  provider: string;
  label: string;
  status: ProviderStatus;
  message?: string;
}

const MAX_CHARS = 2000;

const PROVIDER_CLASS: Record<string, string> = {
  facebook: "fb",
  linkedin: "li",
  whatsapp: "wa",
};

export function Broadcast({ providers }: Props) {
  const [message, setMessage] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [waMode, setWaMode] = useState<"chat" | "to">("chat");
  const [waTarget, setWaTarget] = useState("");
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [sending, setSending] = useState(false);
  const streamCloser = useRef<(() => void) | null>(null);
  const { toast } = useToast();

  useEffect(() => () => streamCloser.current?.(), []);

  const selectedIds = providers.filter((p) => sel[p.id]).map((p) => p.id);
  const whatsAppSelected = !!sel.whatsapp;
  const canSend =
    message.trim().length > 0 &&
    selectedIds.length > 0 &&
    !sending &&
    (!whatsAppSelected || waTarget.trim().length > 0);

  async function send() {
    const providerIds = selectedIds;
    const initial: ResultEntry[] = providerIds.map((id) => ({
      provider: id,
      label: providers.find((p) => p.id === id)?.label ?? id,
      status: "pending",
    }));
    setResults(initial);
    setSending(true);

    const body: Record<string, unknown> = { message: message.trim(), providers: providerIds };
    if (whatsAppSelected) {
      body.whatsapp = waMode === "to" ? { to: waTarget.trim() } : { chat: waTarget.trim() };
    }

    try {
      const { runId } = await postJSON<{ runId: string }>("/api/broadcast", body);
      streamCloser.current = streamRun(runId, (e) => {
        if (e.type === "provider_status") {
          const { provider, status, message: msg } = e.data as {
            provider: string;
            status: ProviderStatus;
            message?: string;
          };
          setResults((prev) =>
            prev.map((r) => (r.provider === provider ? { ...r, status, message: msg } : r))
          );
        }
        if (e.type === "done") {
          setSending(false);
          toast("Broadcast complete", "success");
        }
        if (e.type === "error") {
          setSending(false);
          toast(e.data?.message ?? "Broadcast failed", "error");
        }
      });
    } catch (err) {
      setSending(false);
      toast((err as Error).message, "error");
      setResults([]);
    }
  }

  return (
    <div className="content-container">
      <div className="card broadcast-composer">
        <div className="input-group" style={{ marginBottom: 16 }}>
          <label className="input-label">Message</label>
          <textarea
            className="textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write your message…"
            maxLength={MAX_CHARS}
            rows={5}
          />
          <div className={`char-count${message.length > MAX_CHARS * 0.85 ? " warn" : ""}`}>
            {message.length} / {MAX_CHARS}
          </div>
        </div>

        <div className="input-label" style={{ marginBottom: 8 }}>Channels</div>
        <div className="provider-chips">
          {providers.map((p) => {
            const connected = p.loggedIn;
            const selected = !!sel[p.id];
            const cls = PROVIDER_CLASS[p.id] ?? "";
            return (
              <button
                key={p.id}
                className={`chip ${cls} ${selected ? "chip-selected" : ""} ${!connected ? "chip-disabled" : ""}`}
                onClick={() => {
                  if (!connected) return;
                  setSel((s) => ({ ...s, [p.id]: !s[p.id] }));
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

        {whatsAppSelected && (
          <div className="wa-target">
            <div className="wa-mode-seg">
              <button
                className={waMode === "chat" ? "active" : ""}
                onClick={() => setWaMode("chat")}
              >
                Group name
              </button>
              <button
                className={waMode === "to" ? "active" : ""}
                onClick={() => setWaMode("to")}
              >
                Number
              </button>
            </div>
            <input
              className="input"
              style={{ flex: 1 }}
              value={waTarget}
              onChange={(e) => setWaTarget(e.target.value)}
              placeholder={waMode === "to" ? "33612345678" : "Group name"}
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primary" disabled={!canSend} onClick={send}>
            {sending ? (
              <>
                <Spinner size="sm" />
                Sending…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m3 11 19-9-9 19-2-8-8-2z" />
                </svg>
                Broadcast
              </>
            )}
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="broadcast-results">
          <div className="input-label" style={{ marginBottom: 4 }}>Delivery</div>
          {results.map((r, i) => (
            <div className="result-row" key={r.provider} style={{ animationDelay: `${i * 0.05}s` }}>
              <ProviderIcon provider={r.provider} size={18} />
              <span className="result-provider">{r.label}</span>
              {r.status === "sending" && <Spinner size="sm" />}
              <span className={`result-status ${r.status}`}>
                {r.status === "pending" && "queued"}
                {r.status === "sending" && "sending…"}
                {r.status === "sent" && "✓ sent"}
                {r.status === "error" && `✕ ${r.message ?? "error"}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
