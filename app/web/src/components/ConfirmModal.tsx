export function ConfirmModal({ question, onDecide }: { question: string; onDecide: (allow: boolean) => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center" }}>
      <div style={{ background: "#fff", padding: 24, borderRadius: 8, maxWidth: 480 }}>
        <pre style={{ whiteSpace: "pre-wrap" }}>{question}</pre>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => onDecide(false)}>Annuler</button>
          <button onClick={() => onDecide(true)}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}
