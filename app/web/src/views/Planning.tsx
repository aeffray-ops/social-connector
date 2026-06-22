import { useCallback, useEffect, useState } from "react";
import {
  Provider,
  ScheduledPost,
  HubContent,
  listSchedule,
  cancelSchedule,
  getContents,
  publishScheduledNow,
  streamRun,
} from "../api.js";
import { ProviderIcon } from "../components/ProviderIcon.js";
import { Button } from "../components/Button.js";
import { Spinner } from "../components/Spinner.js";
import { useToast } from "../components/Toast.js";

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
    </div>
  );
}

export { Planning as default };
