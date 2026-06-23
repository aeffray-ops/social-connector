import { useCallback, useEffect, useState } from "react";
import {
  Provider,
  ScheduledPost,
  HubContent,
  listSchedule,
  cancelSchedule,
  getContents,
  getContent,
  updateSchedule,
  publishScheduledNow,
  streamRun,
} from "../api.js";
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

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Planning({ providers }: Props) {
  const { toast } = useToast();
  const [scheduled, setScheduled] = useState<ScheduledPost[]>([]);
  const [published, setPublished] = useState<HubContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduledPost | null>(null);

  const labelFor = useCallback(
    (id: string) => providers.find((p) => p.id === id)?.label ?? id,
    [providers],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p] = await Promise.all([
        listSchedule().catch(() => [] as ScheduledPost[]),
        getContents({ statut: "publie", limit: 50 }).catch(() => [] as HubContent[]),
      ]);
      setScheduled(s);
      setPublished(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publishNow(post: ScheduledPost) {
    setActingId(post.id);
    // Dedicated route: the server resolves the stored text AND the persistent
    // media for this scheduled post (keyed by its UUID), so nothing is lost.
    try {
      const { runId } = await publishScheduledNow(post.id);
      streamRun(runId, (e) => {
        if (e.type === "done") {
          toast("Publié", "success");
          void load();
        }
        if (e.type === "error") toast(e.data?.message ?? "Échec", "error");
      });
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setActingId(null);
    }
  }

  async function cancel(post: ScheduledPost) {
    setActingId(post.id);
    try {
      await cancelSchedule(post.id);
      toast("Programmation annulée", "success");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="content-container">
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: 0 }}>
            Programmés
          </h2>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            {loading ? <Spinner size="sm" /> : "Rafraîchir"}
          </Button>
        </div>

        {!loading && scheduled.length === 0 && (
          <p className="text-muted" style={{ fontSize: 13, margin: "12px 0 0" }}>
            Aucune publication programmée.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
          {scheduled.map((post) => (
            <div
              key={post.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: 12,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  {post.providers.map((id) => (
                    <ProviderIcon key={id} provider={id} size={16} />
                  ))}
                  <span className="text-muted" style={{ fontSize: 12 }}>
                    {post.providers.map(labelFor).join(", ")}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: "var(--text)" }}>
                  ⏰ {fmtWhen(post.publishAt)}
                </div>
                {post.media.length > 0 && (
                  <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {post.media.length} pièce(s) jointe(s)
                  </div>
                )}
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
                  contenu #{post.hubContentId} · statut programmé
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={actingId === post.id}
                  onClick={() => setEditing(post)}
                >
                  Éditer
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={actingId === post.id}
                  onClick={() => void publishNow(post)}
                >
                  {actingId === post.id ? <Spinner size="sm" /> : "Publier maintenant"}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={actingId === post.id}
                  onClick={() => void cancel(post)}
                >
                  Annuler
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 4px" }}>
          Historique (publiés)
        </h2>
        {!loading && published.length === 0 && (
          <p className="text-muted" style={{ fontSize: 13, margin: "12px 0 0" }}>
            Rien de publié pour l'instant.
          </p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
          {published.map((c) => (
            <div
              key={c.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                padding: 12,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span className="input-label" style={{ margin: 0 }}>{c.canal}</span>
                <span className="text-muted" style={{ fontSize: 11 }}>
                  {new Date(c.created_at).toLocaleDateString("fr-FR")}
                </span>
              </div>
              <div style={{ fontSize: 13, color: "var(--text)", whiteSpace: "pre-wrap" }}>
                {c.texte.length > 220 ? `${c.texte.slice(0, 220)}…` : c.texte}
              </div>
            </div>
          ))}
        </div>
      </div>
      {editing && (
        <EditScheduleModal
          post={editing}
          providers={providers}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* ── Édition d'un post programmé ──────────────────────────────────────────── */

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function EditScheduleModal({
  post,
  providers,
  onClose,
  onSaved,
}: {
  post: ScheduledPost;
  providers: Provider[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [texte, setTexte] = useState(post.message ?? "");
  const [loadingText, setLoadingText] = useState(!post.message);
  const [publishAt, setPublishAt] = useState(isoToLocalInput(post.publishAt));
  const [sel, setSel] = useState<Record<string, boolean>>(
    Object.fromEntries(post.providers.map((p) => [p, true])),
  );
  const [waMode, setWaMode] = useState<WaMode>(post.whatsapp?.to ? "to" : "chat");
  const [waTarget, setWaTarget] = useState(post.whatsapp?.to ?? post.whatsapp?.chat ?? "");
  const [keptMedia, setKeptMedia] = useState<string[]>(post.media);
  const [newMedia, setNewMedia] = useState<MediaItem[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pré-remplir le texte depuis le Hub si aucun override n'est stocké.
  useEffect(() => {
    if (post.message) return;
    let alive = true;
    getContent(post.hubContentId)
      .then((c) => {
        if (alive) setTexte(c.texte ?? "");
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingText(false);
      });
    return () => {
      alive = false;
    };
  }, [post.hubContentId, post.message]);

  const selectedIds = providers.filter((p) => sel[p.id]).map((p) => p.id);
  const whatsAppSelected = !!sel.whatsapp;
  const removedMedia = post.media.filter((m) => !keptMedia.includes(m));

  const canSave =
    !busy &&
    texte.trim().length > 0 &&
    !!publishAt &&
    selectedIds.length > 0 &&
    (!whatsAppSelected || waTarget.trim().length > 0);

  async function save() {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("publishAt", new Date(publishAt).toISOString());
      form.append("message", texte.trim());
      form.append("providers", JSON.stringify(selectedIds));
      if (whatsAppSelected) {
        form.append(
          "whatsapp",
          JSON.stringify(waMode === "to" ? { to: waTarget.trim() } : { chat: waTarget.trim() }),
        );
      }
      form.append("removeMedia", JSON.stringify(removedMedia));
      newMedia.forEach((m) => form.append("media", m.file, m.file.name));
      await updateSchedule(post.id, form);
      toast("Programmation mise à jour", "success");
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={() => !busy && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 1000,
        padding: 16,
        overflow: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface,#fff)",
          color: "var(--text)",
          padding: 22,
          borderRadius: "var(--radius-sm,8px)",
          width: "100%",
          maxWidth: 560,
          boxShadow: "0 12px 40px rgba(0,0,0,.3)",
          maxHeight: "90vh",
          overflow: "auto",
        }}
      >
        <h3 style={{ margin: "0 0 14px", fontFamily: "var(--font-display)", fontSize: 16 }}>
          Éditer la programmation
        </h3>

        <div className="input-group" style={{ marginBottom: 12 }}>
          <label className="input-label">Texte</label>
          <textarea
            className="textarea"
            rows={6}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            placeholder={loadingText ? "Chargement…" : ""}
          />
        </div>

        <div className="input-group" style={{ marginBottom: 14 }}>
          <label className="input-label">Date et heure</label>
          <input
            type="datetime-local"
            className="input"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            style={{ maxWidth: 280 }}
          />
        </div>

        <div className="input-label" style={{ marginBottom: 8 }}>Réseaux</div>
        <div style={{ marginBottom: 14 }}>
          <ProviderPicker
            providers={providers}
            selected={sel}
            onToggle={(id) => setSel((s) => ({ ...s, [id]: !s[id] }))}
          />
        </div>

        {whatsAppSelected && (
          <div style={{ marginBottom: 14 }}>
            <WaTarget mode={waMode} target={waTarget} onMode={setWaMode} onTarget={setWaTarget} />
          </div>
        )}

        {post.media.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div className="input-label" style={{ marginBottom: 6 }}>Médias actuels</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {keptMedia.map((m) => (
                <span key={m} className="chip" style={{ gap: 6 }}>
                  {basename(m)}
                  <button
                    onClick={() => setKeptMedia((k) => k.filter((x) => x !== m))}
                    title="Retirer"
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", fontSize: 14 }}
                  >
                    ×
                  </button>
                </span>
              ))}
              {keptMedia.length === 0 && (
                <span className="text-muted" style={{ fontSize: 12 }}>
                  Tous les médias actuels seront retirés.
                </span>
              )}
            </div>
          </div>
        )}

        <MediaPicker media={newMedia} onChange={setNewMedia} onError={setMediaError} error={mediaError} />

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {busy ? (
              <>
                <Spinner size="sm" />
                Enregistrement…
              </>
            ) : (
              "Enregistrer"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export { Planning as default };
