import { useEffect, useRef, useState } from "react";
import { generateImage } from "../api.js";
import { Button } from "./Button.js";
import { Spinner } from "./Spinner.js";

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
  /** Pré-remplit le prompt de génération (= image_prompt du contenu). */
  suggestedPrompt?: string;
}

const FORMATS: Array<{ label: string; size: string }> = [
  { label: "Carré", size: "1080x1080" },
  { label: "Portrait", size: "1080x1350" },
  { label: "Paysage", size: "1536x1024" },
];

/**
 * Media attachment picker : aperçus, contraintes « 1 vidéo OU 6 images max »,
 * ajout/suppression, et révocation des object-URLs. Le bouton « Ajouter »
 * propose un choix : fichier local, ou génération d'un visuel via FLUX (gratuit).
 * Le parent possède l'état `media` / `error` ; ce composant valide et remonte
 * les erreurs via `onError`.
 */
export function MediaPicker({ media, onChange, onError, error, suggestedPrompt }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [genPrompt, setGenPrompt] = useState("");
  const [genSize, setGenSize] = useState(FORMATS[0].size);
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);

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
    if (imgs.length > 6) return onError?.("6 images maximum.");
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

  function openGenerate() {
    setMenuOpen(false);
    setGenErr(null);
    setGenPrompt(suggestedPrompt?.trim() ?? "");
    setGenOpen(true);
  }

  async function runGenerate() {
    const prompt = genPrompt.trim();
    if (!prompt) return setGenErr("Décris le visuel à générer.");
    setGenBusy(true);
    setGenErr(null);
    try {
      const blob = await generateImage(prompt, "ideal", genSize);
      const file = new File([blob], `ideal-render-${media.length + 1}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      addFiles([file]);
      setGenOpen(false);
    } catch (e) {
      setGenErr((e as Error).message);
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <>
      <div className="input-label" style={{ marginBottom: 8 }}>
        Visuels{" "}
        <span style={{ color: "var(--muted)", fontWeight: 400 }}>(1 vidéo ou 6 images max)</span>
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
          onClick={() => setMenuOpen(true)}
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

      {/* Menu de choix : fichier local OU générer un visuel. */}
      {menuOpen && (
        <ModalShell onClose={() => setMenuOpen(false)} maxWidth={380}>
          <div className="input-label" style={{ marginBottom: 12 }}>Ajouter un visuel</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Button
              variant="ghost"
              onClick={() => {
                setMenuOpen(false);
                fileInputRef.current?.click();
              }}
            >
              📁 Fichier local
            </Button>
            <Button variant="ghost" onClick={openGenerate}>
              ✨ Générer un visuel (FLUX, gratuit)
            </Button>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Button variant="ghost" size="sm" onClick={() => setMenuOpen(false)}>
              Annuler
            </Button>
          </div>
        </ModalShell>
      )}

      {/* Panneau de génération d'image. */}
      {genOpen && (
        <ModalShell onClose={() => !genBusy && setGenOpen(false)} maxWidth={520}>
          <div className="input-label" style={{ marginBottom: 4 }}>Générer un visuel</div>
          <p className="text-muted" style={{ fontSize: 12, margin: "0 0 12px" }}>
            Style IDEAL appliqué automatiquement. Génération gratuite (FLUX).
          </p>
          <div className="input-group" style={{ marginBottom: 12 }}>
            <label className="input-label">Description du visuel</label>
            <textarea
              className="textarea"
              rows={3}
              value={genPrompt}
              onChange={(e) => setGenPrompt(e.target.value)}
              placeholder="Ex. séjour lumineux ouvert sur une terrasse, maison rénovée…"
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <div className="input-label" style={{ marginBottom: 6 }}>Format</div>
            <div style={{ display: "flex", gap: 8 }}>
              {FORMATS.map((f) => (
                <Button
                  key={f.size}
                  size="sm"
                  variant={genSize === f.size ? "primary" : "ghost"}
                  onClick={() => setGenSize(f.size)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>
          {genErr && (
            <div style={{ color: "#e5534b", fontSize: 12, marginBottom: 12 }}>{genErr}</div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="ghost" onClick={() => setGenOpen(false)} disabled={genBusy}>
              Annuler
            </Button>
            <Button variant="primary" onClick={runGenerate} disabled={genBusy || !genPrompt.trim()}>
              {genBusy ? (
                <>
                  <Spinner size="sm" />
                  Génération…
                </>
              ) : (
                "Générer"
              )}
            </Button>
          </div>
        </ModalShell>
      )}
    </>
  );
}

/** Overlay modal centré, réutilisé par le menu et le panneau de génération. */
function ModalShell({
  children,
  onClose,
  maxWidth = 440,
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: number;
}) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", display: "grid", placeItems: "center", zIndex: 1000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface, #fff)",
          color: "var(--text)",
          padding: 22,
          borderRadius: "var(--radius-sm, 8px)",
          width: "90%",
          maxWidth,
          boxShadow: "0 12px 40px rgba(0,0,0,.3)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
