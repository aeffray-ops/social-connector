import { useState } from "react";
import { postJSON, streamRun } from "../api.js";

const PROVIDERS = [
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "whatsapp", label: "WhatsApp" },
];

export function Broadcast() {
  const [message, setMessage] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [waMode, setWaMode] = useState<"chat" | "to">("chat");
  const [waTarget, setWaTarget] = useState("");
  const [status, setStatus] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function send() {
    setError(""); setStatus({});
    const providers = PROVIDERS.filter((p) => sel[p.id]).map((p) => p.id);
    const body: any = { message, providers };
    if (sel.whatsapp) body.whatsapp = waMode === "to" ? { to: waTarget } : { chat: waTarget };
    try {
      const { runId } = await postJSON<{ runId: string }>("/api/broadcast", body);
      streamRun(runId, (e) => {
        if (e.type === "provider_status") {
          setStatus((s) => ({ ...s, [e.data.provider]: e.data.message ? `error: ${e.data.message}` : e.data.status }));
        }
      });
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div>
      <h2>Broadcast</h2>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} style={{ width: "100%" }} placeholder="Ton message…" />
      <div style={{ display: "flex", gap: 12, margin: "8px 0" }}>
        {PROVIDERS.map((p) => (
          <label key={p.id}><input type="checkbox" checked={!!sel[p.id]} onChange={(e) => setSel((s) => ({ ...s, [p.id]: e.target.checked }))} /> {p.label} {status[p.id] ? `(${status[p.id]})` : ""}</label>
        ))}
      </div>
      {sel.whatsapp && (
        <div style={{ margin: "8px 0" }}>
          <select value={waMode} onChange={(e) => setWaMode(e.target.value as any)}>
            <option value="chat">Groupe / nom</option>
            <option value="to">Numéro</option>
          </select>
          <input value={waTarget} onChange={(e) => setWaTarget(e.target.value)} placeholder={waMode === "to" ? "33612345678" : "Nom du groupe"} />
        </div>
      )}
      <button onClick={send} disabled={!message.trim()}>Envoyer</button>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
    </div>
  );
}
