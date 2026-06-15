import { useEffect, useState } from "react";
import { getJSON, postJSON, streamRun } from "../api.js";

interface P { id: string; label: string; loggedIn: boolean; }

export function Sessions() {
  const [list, setList] = useState<P[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => getJSON<P[]>("/api/providers").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);

  async function login(id: string) {
    setBusy(id);
    const { runId } = await postJSON<{ runId: string }>(`/api/login/${id}`, {});
    streamRun(runId, (e) => {
      if (e.type === "done" || e.type === "error") { setBusy(null); load(); }
    });
  }

  return (
    <div>
      <h2>Sessions</h2>
      {list.map((p) => (
        <div key={p.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 8 }}>
          <strong style={{ width: 100 }}>{p.label}</strong>
          <span>{p.loggedIn ? "✅ connecté" : "— déconnecté"}</span>
          <button disabled={busy === p.id} onClick={() => login(p.id)}>
            {busy === p.id ? "Fenêtre ouverte — connecte-toi…" : "Login"}
          </button>
        </div>
      ))}
    </div>
  );
}
