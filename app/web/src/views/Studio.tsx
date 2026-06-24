import { useEffect, useMemo, useRef, useState } from "react";
import {
  Provider,
  HubConfig,
  HubContent,
  HubAudience,
  getHubConfig,
  generateMessages,
  generateAgenda,
  publishContent,
  scheduleContent,
  streamRun,
} from "../api.js";
import { canalToProvider } from "../channelMap.js";
import { Button } from "../components/Button.js";
import { Spinner } from "../components/Spinner.js";
import { useToast } from "../components/Toast.js";
import { ConfirmModal } from "../components/ConfirmModal.js";
import { MediaPicker, MediaItem } from "../components/MediaPicker.js";
import { ProviderPicker } from "../components/ProviderPicker.js";
import { WaTarget, WaMode } from "../components/WaTarget.js";

interface Props {
  providers: Provider[];
}

type ProviderStatus = "pending" | "sending" | "sent" | "error";

export function Studio({ providers }: Props) {
  const { toast } = useToast();
  const [config, setConfig] = useState<HubConfig | null>(null);

  // Brief
  const [pitch, setPitch] = useState("");
  const [cible, setCible] = useState("");
  const [atelier, setAtelier] = useState("");
  const [rdv, setRdv] = useState("");
  const [objectifs, setObjectifs] = useState("");
  const [audience, setAudience] = useState<HubAudience>("pros");
  const [selCanaux, setSelCanaux] = useState<Record<string, boolean>>({});

  const [generating, setGenerating] = useState(false);
  const [contents, setContents] = useState<HubContent[]>([]);

  useEffect(() => {
    getHubConfig()
      .then(setConfig)
      .catch((e) => toast((e as Error).message, "error"));
  }, [toast]);

  // Canaux available for the chosen audience.
  const canauxForAudience = useMemo(() => {
    if (!config) return [] as Array<{ key: string; nom: string }>;
    return Object.entries(config.canaux)
      .filter(([, c]) => c.audience === audience)
      .map(([key, c]) => ({ key, nom: c.nom }));
  }, [config, audience]);

  // Reset channel selection when the audience changes (keys differ per audience).
  useEffect(() => {
    setSelCanaux({});
  }, [audience]);

  const audienceList = useMemo(() => {
    if (!config) return [] as Array<{ key: HubAudience; nom: string }>;
    return (Object.entries(config.audiences) as Array<[HubAudience, { nom: string }]>).map(
      ([key, a]) => ({ key, nom: a.nom }),
    );
  }, [config]);

  const chosenCanaux = Object.keys(selCanaux).filter((k) => selCanaux[k]);
  const canGenerate = !generating && chosenCanaux.length > 0 && pitch.trim().length > 0;

  async function generate() {
    setGenerating(true);
    setContents([]);
    const brief = {
      pitch: pitch.trim(),
      cible: cible.trim(),
      atelier: atelier.trim(),
      rdv: rdv.trim(),
    };
    const objs = objectifs
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      if (audience === "ext") {
        // Notoriété -> agenda
        const res = await generateAgenda({
          brief,
          objectifs: objs,
          canaux: chosenCanaux,
        });
        const flat = res.jours.flatMap((j) => j.posts);
        setContents(flat);
      } else {
        const res = await generateMessages({
          audience,
          brief,
          type: "",
          canaux: chosenCanaux,
        });
        setContents(res.messages);
      }
      toast("Contenus générés", "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="content-container">
      <div className="card">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 4px" }}>
          Brief
        </h2>
        <p className="text-muted" style={{ fontSize: 13, margin: "0 0 18px" }}>
          Décris ce que tu veux dire. Le Hub génère, tu valides, tu publies.
        </p>

        <div className="input-group" style={{ marginBottom: 14 }}>
          <label className="input-label">Pitch / message clé</label>
          <textarea
            className="textarea"
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            placeholder="L'idée centrale à faire passer…"
            rows={3}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
          <div className="input-group">
            <label className="input-label">Cible</label>
            <input
              className="input"
              value={cible}
              onChange={(e) => setCible(e.target.value)}
              placeholder="À qui tu parles"
            />
          </div>
          <div className="input-group">
            <label className="input-label">Objectifs</label>
            <input
              className="input"
              value={objectifs}
              onChange={(e) => setObjectifs(e.target.value)}
              placeholder="Séparés par une virgule"
            />
          </div>
          <div className="input-group">
            <label className="input-label">Atelier / simulateur</label>
            <input
              className="input"
              value={atelier}
              onChange={(e) => setAtelier(e.target.value)}
              placeholder="Lien ou nom (optionnel)"
            />
          </div>
          <div className="input-group">
            <label className="input-label">RDV / CTA</label>
            <input
              className="input"
              value={rdv}
              onChange={(e) => setRdv(e.target.value)}
              placeholder="Lien de prise de RDV (optionnel)"
            />
          </div>
        </div>

        <div className="input-label" style={{ marginBottom: 8 }}>Audience</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
          {audienceList.map((a) => (
            <Button
              key={a.key}
              variant={audience === a.key ? "primary" : "ghost"}
              size="sm"
              onClick={() => setAudience(a.key)}
            >
              {audienceLabel(a.key, a.nom)}
            </Button>
          ))}
        </div>

        <div className="input-label" style={{ marginBottom: 8 }}>Canaux</div>
        <div className="provider-chips" style={{ marginBottom: 18 }}>
          {canauxForAudience.length === 0 && (
            <span className="text-muted" style={{ fontSize: 13 }}>
              {config ? "Aucun canal pour cette audience." : "Chargement…"}
            </span>
          )}
          {canauxForAudience.map((c) => {
            const pid = canalToProvider(c.key);
            const cls = pid === "facebook" ? "fb" : pid === "linkedin" ? "li" : pid === "whatsapp" ? "wa" : "";
            const selected = !!selCanaux[c.key];
            return (
              <button
                key={c.key}
                className={`chip ${cls} ${selected ? "chip-selected" : ""}`}
                onClick={() => setSelCanaux((s) => ({ ...s, [c.key]: !s[c.key] }))}
              >
                {c.nom}
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="primary" disabled={!canGenerate} onClick={generate}>
            {generating ? (
              <>
                <Spinner size="sm" />
                Génération…
              </>
            ) : (
              "Générer"
            )}
          </Button>
        </div>
      </div>

      {contents.map((c) => (
        <ContentCard key={c.id} content={c} providers={providers} />
      ))}
    </div>
  );
}

function audienceLabel(key: HubAudience, fallback: string): string {
  if (key === "ext") return "Notoriété";
  if (key === "pros") return "Prospects";
  if (key === "mem") return "Membres";
  return fallback;
}

/* ── Per-content card ─────────────────────────────────────────────────────── */

interface CardProps {
  content: HubContent;
  providers: Provider[];
}

function ContentCard({ content, providers }: CardProps) {
  const { toast } = useToast();
  // Filets : un payload Hub incomplet (champ absent) ne doit JAMAIS crasher la carte.
  const variantes = Array.isArray(content.variantes) ? content.variantes : [];
  const alertes = Array.isArray(content.alertes) ? content.alertes : [];
  const [texte, setTexte] = useState(content.texte ?? "");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [waMode, setWaMode] = useState<WaMode>("chat");
  const [waTarget, setWaTarget] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [publishAt, setPublishAt] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Per-provider delivery status (after "Publier maintenant").
  const [results, setResults] = useState<Record<string, { status: ProviderStatus; message?: string }>>(
    {},
  );
  const streamCloser = useRef<(() => void) | null>(null);
  useEffect(() => () => streamCloser.current?.(), []);

  // Pré-cocher selon le mapping canal->provider du contenu.
  const initialProvider = canalToProvider(content.canal);
  const [sel, setSel] = useState<Record<string, boolean>>(
    initialProvider ? { [initialProvider]: true } : {},
  );

  const selectedIds = providers.filter((p) => sel[p.id]).map((p) => p.id);
  const whatsAppSelected = !!sel.whatsapp;
  const hasAlertes = alertes.length > 0;

  const canAct =
    !busy &&
    texte.trim().length > 0 &&
    selectedIds.length > 0 &&
    (!whatsAppSelected || waTarget.trim().length > 0);

  function buildForm(): FormData {
    const form = new FormData();
    form.append("message", texte.trim());
    form.append("providers", JSON.stringify(selectedIds));
    if (whatsAppSelected) {
      form.append(
        "whatsapp",
        JSON.stringify(waMode === "to" ? { to: waTarget.trim() } : { chat: waTarget.trim() }),
      );
    }
    media.forEach((m) => form.append("media", m.file, m.file.name));
    return form;
  }

  async function doPublish() {
    setBusy(true);
    const initial: Record<string, { status: ProviderStatus }> = {};
    selectedIds.forEach((id) => (initial[id] = { status: "pending" }));
    setResults(initial);
    try {
      const { runId } = await publishContent(content.id, buildForm());
      streamCloser.current = streamRun(runId, (e) => {
        if (e.type === "provider_status") {
          const { provider, status, message } = e.data as {
            provider: string;
            status: ProviderStatus;
            message?: string;
          };
          setResults((prev) => ({ ...prev, [provider]: { status, message } }));
        }
        if (e.type === "done") {
          setBusy(false);
          toast("Publication terminée", "success");
        }
        if (e.type === "error") {
          setBusy(false);
          toast(e.data?.message ?? "Échec de publication", "error");
        }
      });
    } catch (e) {
      setBusy(false);
      toast((e as Error).message, "error");
    }
  }

  function onPublishClick() {
    if (hasAlertes) {
      setConfirmOpen(true);
      return;
    }
    void doPublish();
  }

  async function doSchedule() {
    if (!publishAt) {
      toast("Choisis une date et une heure", "error");
      return;
    }
    setBusy(true);
    const form = buildForm();
    // datetime-local -> ISO 8601
    form.append("publishAt", new Date(publishAt).toISOString());
    try {
      await scheduleContent(content.id, form);
      toast("Programmé", "success");
      setScheduleOpen(false);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {hasAlertes && (
        <div
          style={{
            background: "rgba(248, 81, 73, 0.12)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            marginBottom: 14,
            fontSize: 13,
          }}
        >
          <strong>⚠ Interdits détectés</strong>
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            {alertes.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <div
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 10,
          fontSize: 12,
          color: "var(--muted)",
        }}
      >
        <span className="input-label" style={{ margin: 0 }}>
          {content.canal}
        </span>
        {content.pilier && <span>· {content.pilier}</span>}
        {content.jour && <span>· {content.jour} {content.heure}</span>}
      </div>

      <div className="input-group" style={{ marginBottom: 12 }}>
        <label className="input-label">Texte</label>
        <textarea
          className="textarea"
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          rows={6}
        />
      </div>

      {variantes.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="input-label" style={{ marginBottom: 6 }}>Variantes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {variantes.map((v, i) => (
              <button
                key={i}
                className="chip"
                style={{ textAlign: "left", whiteSpace: "normal", height: "auto", lineHeight: 1.4 }}
                onClick={() => setTexte(v)}
                title="Utiliser cette variante"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {content.image_prompt && (
        <div className="text-muted" style={{ fontSize: 12, marginBottom: 12, fontStyle: "italic" }}>
          🎨 Visuel suggéré : {content.image_prompt}
        </div>
      )}

      <MediaPicker
        media={media}
        onChange={setMedia}
        onError={setMediaError}
        error={mediaError}
        suggestedPrompt={content.image_prompt}
      />

      <div className="input-label" style={{ marginBottom: 8 }}>Réseaux</div>
      <ProviderPicker
        providers={providers}
        selected={sel}
        onToggle={(id) => setSel((s) => ({ ...s, [id]: !s[id] }))}
      />

      {whatsAppSelected && (
        <WaTarget mode={waMode} target={waTarget} onMode={setWaMode} onTarget={setWaTarget} />
      )}

      {scheduleOpen && (
        <div className="input-group" style={{ marginTop: 12, marginBottom: 4 }}>
          <label className="input-label">Date et heure de publication</label>
          <input
            type="datetime-local"
            className="input"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            style={{ maxWidth: 280 }}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        {scheduleOpen ? (
          <>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)} disabled={busy}>
              Annuler
            </Button>
            <Button variant="primary" onClick={doSchedule} disabled={!canAct || !publishAt}>
              {busy ? <Spinner size="sm" /> : null}
              Confirmer la programmation
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={() => setScheduleOpen(true)} disabled={!canAct}>
              Programmer
            </Button>
            <Button variant="primary" onClick={onPublishClick} disabled={!canAct}>
              {busy ? (
                <>
                  <Spinner size="sm" />
                  Publication…
                </>
              ) : (
                "Publier maintenant"
              )}
            </Button>
          </>
        )}
      </div>

      {Object.keys(results).length > 0 && (
        <div className="broadcast-results" style={{ marginTop: 14 }}>
          {selectedIds.map((id) => {
            const r = results[id];
            const label = providers.find((p) => p.id === id)?.label ?? id;
            const status = r?.status ?? "pending";
            return (
              <div className="result-row" key={id}>
                <span className="result-provider">{label}</span>
                {status === "sending" && <Spinner size="sm" />}
                <span className={`result-status ${status}`}>
                  {status === "pending" && "queued"}
                  {status === "sending" && "sending…"}
                  {status === "sent" && "✓ sent"}
                  {status === "error" && `✕ ${r?.message ?? "error"}`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {confirmOpen && (
        <ConfirmModal
          question={`Ce contenu déclenche des alertes (interdits détectés) :\n\n${alertes
            .map((a) => `• ${a}`)
            .join("\n")}\n\nPublier quand même ?`}
          onDecide={(allow) => {
            setConfirmOpen(false);
            if (allow) void doPublish();
          }}
        />
      )}
    </div>
  );
}

export { Studio as default };
