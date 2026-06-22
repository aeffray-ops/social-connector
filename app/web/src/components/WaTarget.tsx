export type WaMode = "chat" | "to";

interface Props {
  mode: WaMode;
  target: string;
  onMode: (mode: WaMode) => void;
  onTarget: (target: string) => void;
}

/**
 * WhatsApp target selector extracted verbatim from Broadcast: a segmented
 * "Group name | Number" toggle plus the matching input. Render it only when
 * WhatsApp is among the selected providers.
 */
export function WaTarget({ mode, target, onMode, onTarget }: Props) {
  return (
    <div className="wa-target">
      <div className="wa-mode-seg">
        <button className={mode === "chat" ? "active" : ""} onClick={() => onMode("chat")}>
          Group name
        </button>
        <button className={mode === "to" ? "active" : ""} onClick={() => onMode("to")}>
          Number
        </button>
      </div>
      <input
        className="input"
        style={{ flex: 1 }}
        value={target}
        onChange={(e) => onTarget(e.target.value)}
        placeholder={mode === "to" ? "33612345678" : "Group name"}
      />
    </div>
  );
}
