import { useEffect, useRef, useState } from "react";
import { postForm, streamRun, Provider } from "../api.js";
import { ProviderIcon } from "../components/ProviderIcon.js";
import { Button } from "../components/Button.js";
import { Spinner } from "../components/Spinner.js";
import { useToast } from "../components/Toast.js";
import { MediaPicker, MediaItem } from "../components/MediaPicker.js";
import { ProviderPicker } from "../components/ProviderPicker.js";
import { WaTarget, WaMode } from "../components/WaTarget.js";

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

export function Broadcast({ providers }: Props) {
  const [message, setMessage] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [waMode, setWaMode] = useState<WaMode>("chat");
  const [waTarget, setWaTarget] = useState("");
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [sending, setSending] = useState(false);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const streamCloser = useRef<(() => void) | null>(null);
  const { toast } = useToast();

  useEffect(() => () => streamCloser.current?.(), []);

  const selectedIds = providers.filter((p) => sel[p.id]).map((p) => p.id);
  const whatsAppSelected = !!sel.whatsapp;
  const canSend =
    (message.trim().length > 0 || media.length > 0) &&
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

    const form = new FormData();
    form.append("message", message.trim());
    form.append("providers", JSON.stringify(providerIds));
    if (whatsAppSelected) {
      form.append("whatsapp", JSON.stringify(waMode === "to" ? { to: waTarget.trim() } : { chat: waTarget.trim() }));
    }
    media.forEach((m) => form.append("media", m.file, m.file.name));

    try {
      const { runId } = await postForm<{ runId: string }>("/api/broadcast", form);
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

        <MediaPicker media={media} onChange={setMedia} onError={setMediaError} error={mediaError} />

        <div className="input-label" style={{ marginBottom: 8 }}>Channels</div>
        <ProviderPicker
          providers={providers}
          selected={sel}
          onToggle={(id) => setSel((s) => ({ ...s, [id]: !s[id] }))}
        />

        {whatsAppSelected && (
          <WaTarget mode={waMode} target={waTarget} onMode={setWaMode} onTarget={setWaTarget} />
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
