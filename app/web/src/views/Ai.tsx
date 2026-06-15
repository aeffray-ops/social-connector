import { useState } from "react";
import { postJSON, streamRun } from "../api.js";
import { ConfirmModal } from "../components/ConfirmModal.js";

export function Ai() {
  const [instruction, setInstruction] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [pending, setPending] = useState<{ runId: string; confirmId: string; question: string } | null>(null);

  async function run() {
    setLog([]);
    const { runId } = await postJSON<{ runId: string }>("/api/ai", { instruction });
    streamRun(runId, (e) => {
      if (e.type === "message") setLog((l) => [...l, e.data.text]);
      else if (e.type === "confirm_request") setPending({ runId, confirmId: e.data.confirmId, question: e.data.question });
      else if (e.type === "error") setLog((l) => [...l, `Erreur: ${e.data.message}`]);
    });
  }

  async function decide(allow: boolean) {
    if (!pending) return;
    await postJSON(`/api/ai/${pending.runId}/confirm`, { confirmId: pending.confirmId, allow });
    setPending(null);
  }

  return (
    <div>
      <h2>IA</h2>
      <input value={instruction} onChange={(e) => setInstruction(e.target.value)} style={{ width: "80%" }} placeholder="ex: résume les conversations d'aujourd'hui" />
      <button onClick={run} disabled={!instruction.trim()}>Go</button>
      <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{log.join("\n")}</div>
      {pending && <ConfirmModal question={pending.question} onDecide={decide} />}
    </div>
  );
}
