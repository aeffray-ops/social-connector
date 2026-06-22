import { useEffect, useRef } from "react";

export interface MediaItem {
  file: File;
  url: string;
}

interface Props {
  media: MediaItem[];
  onChange: (media: MediaItem[]) => void;
  /** Validation message sink. Receives a string on error, null when cleared. */
  onError?: (msg: string | null) => void;
  /** Validation error message to display under the thumbnails. */
  error?: string | null;
}

/**
 * Media attachment picker extracted verbatim from Broadcast: preview thumbnails,
 * the "1 video OR 3 images max" constraints, add/remove, and object-URL revoke.
 * The parent owns the `media` and `error` state; this component validates and
 * reports failures through `onError`.
 */
export function MediaPicker({ media, onChange, onError, error }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke object URLs on unmount.
  useEffect(() => () => media.forEach((m) => URL.revokeObjectURL(m.url)), [media]);

  function addFiles(picked: File[]) {
    onError?.(null);
    const merged = [...media.map((m) => m.file), ...picked];
    const bad = merged.find((f) => !f.type.startsWith("image/") && !f.type.startsWith("video/"));
    if (bad) return onError?.("Images ou vidéos uniquement.");
    const vids = merged.filter((f) => f.type.startsWith("video/"));
    const imgs = merged.filter((f) => f.type.startsWith("image/"));
    if (vids.length > 1) return onError?.("Une seule vidéo par post.");
    if (vids.length === 1 && imgs.length > 0)
      return onError?.("Une vidéo OU des images, pas les deux.");
    if (imgs.length > 3) return onError?.("3 images maximum.");
    // Rebuild keeping existing urls, creating urls for new files.
    const existing = new Map(media.map((m) => [m.file, m.url]));
    onChange(merged.map((f) => ({ file: f, url: existing.get(f) ?? URL.createObjectURL(f) })));
  }

  function removeMedia(idx: number) {
    onError?.(null);
    const m = media[idx];
    if (m) URL.revokeObjectURL(m.url);
    onChange(media.filter((_, i) => i !== idx));
  }

  return (
    <>
      <div className="input-label" style={{ marginBottom: 8 }}>
        Visuels{" "}
        <span style={{ color: "var(--muted)", fontWeight: 400 }}>(1 vidéo ou 3 images max)</span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        {media.map((m, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              width: 72,
              height: 72,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid var(--border)",
              background: "#000",
            }}
          >
            {m.file.type.startsWith("image/") ? (
              <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <video src={m.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
            )}
            <button
              onClick={() => removeMedia(i)}
              title="Retirer"
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: "none",
                background: "rgba(0,0,0,.65)",
                color: "#fff",
                cursor: "pointer",
                fontSize: 13,
                lineHeight: "16px",
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => fileInputRef.current?.click()}
          style={{ width: 72, height: 72, justifyContent: "center", flexDirection: "column", gap: 4 }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span style={{ fontSize: 10 }}>Ajouter</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      {error && (
        <div style={{ color: "#e5534b", fontSize: 12, marginTop: -8, marginBottom: 12 }}>{error}</div>
      )}
    </>
  );
}
