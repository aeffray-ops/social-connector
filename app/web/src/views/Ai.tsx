import { useEffect, useRef, useState } from "react";
import { postJSON, streamRun } from "../api.js";
import { Button } from "../components/Button.js";
import { Spinner } from "../components/Spinner.js";
import { Modal } from "../components/Modal.js";

type MsgRole = "user" | "agent" | "error";

interface TranscriptMsg {
  role: MsgRole;
  text: string;
}

interface PendingConfirm {
  runId: string;
  confirmId: string;
  question: string;
}

export function Assistant() {
  const [instruction, setInstruction] = useState("");
  const [transcript, setTranscript] = useState<TranscriptMsg[]>([]);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [running, setRunning] = useState(false);
  const streamCloser = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => streamCloser.current?.(), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript, running]);

  async function run() {
    if (!instruction.trim() || running) return;
    const userMsg = instruction.trim();
    setInstruction("");
    setTranscript((t) => [...t, { role: "user", text: userMsg }]);
    setRunning(true);

    try {
      const { runId } = await postJSON<{ runId: string }>("/api/ai", { instruction: userMsg });
      streamCloser.current = streamRun(runId, (e) => {
        if (e.type === "message") {
          setTranscript((t) => [...t, { role: "agent", text: e.data.text }]);
        } else if (e.type === "confirm_request") {
          setPending({ runId, confirmId: e.data.confirmId, question: e.data.question });
        } else if (e.type === "error") {
          setTranscript((t) => [...t, { role: "error", text: e.data?.message ?? "Unknown error" }]);
          setRunning(false);
        } else if (e.type === "done") {
          setRunning(false);
        }
      });
    } catch (err) {
      setTranscript((t) => [...t, { role: "error", text: (err as Error).message }]);
      setRunning(false);
    }
  }

  async function decide(allow: boolean) {
    if (!pending) return;
    try {
      await postJSON(`/api/ai/${pending.runId}/confirm`, {
        confirmId: pending.confirmId,
        allow,
      });
    } finally {
      setPending(null);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      run();
    }
  }

  return (
    <div className="content-container">
      <div className="card" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - var(--topbar-height) - 64px)", minHeight: 400 }}>
        {/* Transcript */}
        <div className="assistant-transcript" style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {transcript.length === 0 && (
            <div className="empty-state" style={{ height: "100%" }}>
              <div className="empty-state-icon" style={{ fontSize: 28 }}>⚡</div>
              <div className="empty-state-title">Relay Assistant</div>
              <div className="empty-state-sub">
                Ask the agent to summarize conversations, send messages, or manage your accounts.
              </div>
            </div>
          )}
          {transcript.map((msg, i) => (
            <div key={i} className={`transcript-msg ${msg.role}`} style={{ animationDelay: `${i * 0.03}s` }}>
              <span className="transcript-label">
                {msg.role === "user" ? "You" : msg.role === "error" ? "Error" : "Agent"}
              </span>
              <div className={`transcript-bubble${msg.role === "error" ? " error" : ""}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {running && !pending && (
            <div className="assistant-working">
              <Spinner size="sm" />
              <span className="font-mono text-muted">working…</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="assistant-input-area">
          <textarea
            className="textarea"
            style={{ flex: 1, minHeight: 52, maxHeight: 120, resize: "none" }}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Give the agent an instruction… (Enter to send, Shift+Enter for newline)"
            disabled={running}
          />
          <Button
            variant="primary"
            disabled={!instruction.trim() || running}
            onClick={run}
          >
            {running ? <Spinner size="sm" /> : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 11 19-9-9 19-2-8-8-2z" />
              </svg>
            )}
            Send
          </Button>
        </div>
      </div>

      {pending && (
        <Modal
          title="Agent confirmation required"
          onClose={() => decide(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => decide(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => decide(true)}>Confirm</Button>
            </>
          }
        >
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)", lineHeight: 1.6 }}>
            {pending.question}
          </pre>
        </Modal>
      )}
    </div>
  );
}
