export async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

export async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

/** POST multipart/form-data (used by Broadcast to upload media + fields). */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const r = await fetch(path, { method: "POST", body: form });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

export interface RunEvent {
  type: string;
  data?: any;
}

export function streamRun(runId: string, onEvent: (e: RunEvent) => void): () => void {
  const es = new EventSource(`/api/events/${runId}`);
  es.onmessage = (m) => {
    const e: RunEvent = JSON.parse(m.data);
    onEvent(e);
    if (e.type === "done" || e.type === "error") es.close();
  };
  return () => es.close();
}

export interface Provider {
  id: string;
  label: string;
  loggedIn: boolean;
}

export interface RecentChat {
  name: string;
  time: string;
  preview: string;
  unread: number;
}

export interface ConversationMessage {
  from: string;
  text: string;
  time: string;
  date?: string;
}

export interface Post {
  text: string;
  url?: string;
  time?: string;
}

export async function logout(provider: string): Promise<{ ok: boolean; loggedIn: boolean }> {
  return postJSON(`/api/logout/${provider}`, {});
}

/** Authoritative check: launches a hidden browser to confirm the real session. */
export async function verifyProvider(
  provider: string,
): Promise<{ id: string; loggedIn: boolean; error?: string }> {
  return postJSON(`/api/verify/${provider}`, {});
}

/** Masked AI settings (provider + key hints, never the raw secrets). */
export interface SettingsView {
  aiProvider: "openai" | "anthropic" | null;
  openai: string | null;
  anthropic: string | null;
}

export interface SettingsPatch {
  aiProvider?: "openai" | "anthropic";
  openaiKey?: string;
  anthropicKey?: string;
}

export async function getSettings(): Promise<SettingsView> {
  return getJSON<SettingsView>("/api/settings");
}

export async function saveSettings(patch: SettingsPatch): Promise<SettingsView> {
  return postJSON<SettingsView>("/api/settings", patch);
}

/* ──────────────────────────────────────────────────────────────────────────
 * Hub (génération de contenus) — proxifié par Relay sous /api/hub/*.
 * Contrats figés : voir le brief / ideal-content-hub.
 * ────────────────────────────────────────────────────────────────────────── */

export type HubAudience = "ext" | "pros" | "mem";
export type HubStatut = "en_attente" | "valide" | "programme" | "publie" | "ignore";

export interface HubCharte {
  bordeaux: string;
  jaune: string;
  [k: string]: unknown;
}

/** GET /api/hub/config */
export interface HubConfig {
  piliers: Record<string, { nom: string; dosage?: number; contenu?: string }>;
  canaux: Record<
    string,
    { nom: string; audience: HubAudience; regles?: string; longueur?: string }
  >;
  audiences: Record<
    string,
    { nom: string; objectif?: string; allow_50?: boolean; ton?: string }
  >;
  charte: HubCharte;
}

/** A single generated content item (Hub `content`). */
export interface HubContent {
  id: number;
  created_at: string;
  audience: HubAudience;
  canal: string;
  jour: string;
  heure: string;
  pilier: string;
  objectif: string;
  obj_type: string;
  texte: string;
  variantes: string[];
  image_prompt: string;
  relais: string;
  alertes: string[];
  statut: HubStatut;
  batch: string;
}

export interface HubBrief {
  pitch?: string;
  cible?: string;
  atelier?: string;
  rdv?: string;
}

export interface GenerateMessagesBody {
  audience: "pros" | "mem";
  brief: HubBrief;
  type?: string;
  canaux: string[];
}

export interface GenerateMessagesResult {
  messages: HubContent[];
  batch: string;
}

export interface GenerateAgendaBody {
  brief: HubBrief;
  objectifs: string[];
  canaux: string[];
  rythme?: string;
  evenement?: string;
  jours?: Array<{ jour: string; date: string }>;
  semaine?: string;
}

export interface GenerateAgendaResult {
  jours: Array<{ jour: string; posts: HubContent[] }>;
  batch: string;
}

/** GET /api/hub/config */
export async function getHubConfig(): Promise<HubConfig> {
  return getJSON<HubConfig>("/api/hub/config");
}

/** POST /api/hub/generate/messages (audiences pros|mem). */
export async function generateMessages(
  body: GenerateMessagesBody,
): Promise<GenerateMessagesResult> {
  return postJSON<GenerateMessagesResult>("/api/hub/generate/messages", body);
}

/** POST /api/hub/generate/agenda (audience ext / notoriété). */
export async function generateAgenda(body: GenerateAgendaBody): Promise<GenerateAgendaResult> {
  return postJSON<GenerateAgendaResult>("/api/hub/generate/agenda", body);
}

export interface GetContentsParams {
  statut?: HubStatut;
  canal?: string;
  audience?: HubAudience;
  limit?: number;
}

/** GET /api/hub/contents?statut=&canal=&audience=&limit= */
export async function getContents(params: GetContentsParams = {}): Promise<HubContent[]> {
  const q = new URLSearchParams();
  if (params.statut) q.set("statut", params.statut);
  if (params.canal) q.set("canal", params.canal);
  if (params.audience) q.set("audience", params.audience);
  if (params.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return getJSON<HubContent[]>(`/api/hub/contents${qs ? `?${qs}` : ""}`);
}

/** GET /api/hub/contents/:id — un contenu précis (pour pré-remplir une édition). */
export async function getContent(id: number): Promise<HubContent> {
  return getJSON<HubContent>(`/api/hub/contents/${id}`);
}

/** PATCH /api/hub/contents/:id -> {ok,id,statut} */
export async function patchContent(
  id: number,
  statut: HubStatut,
): Promise<{ ok: boolean; id: number; statut: HubStatut }> {
  const r = await fetch(`/api/hub/contents/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statut }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

/* ──────────────────────────────────────────────────────────────────────────
 * Relay — publication immédiate / programmée d'un contenu Hub.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * POST multipart /api/content/:id/publish
 * FormData: message, providers (JSON), whatsapp (JSON, optionnel), media (fichiers).
 * -> { runId } à streamer via streamRun().
 */
export async function publishContent(id: number, form: FormData): Promise<{ runId: string }> {
  return postForm<{ runId: string }>(`/api/content/${id}/publish`, form);
}

/**
 * POST multipart /api/content/:id/schedule
 * FormData: publishAt (ISO 8601), message, providers (JSON), whatsapp (JSON, optionnel), media.
 * -> { ok:true, id:<scheduledId> } (id = UUID du post programmé dans le store Relay).
 */
export async function scheduleContent(
  id: number,
  form: FormData,
): Promise<{ ok: boolean; id: string }> {
  return postForm<{ ok: boolean; id: string }>(`/api/content/${id}/schedule`, form);
}

/** A scheduled post stored by Relay (mirror of server scheduleStore.ScheduledPost). */
export interface ScheduledPost {
  id: string;
  hubContentId: number;
  publishAt: string;
  providers: string[];
  whatsapp?: { to?: string; chat?: string };
  media: string[];
  /** Optional text override stored at schedule time (else the Hub content text). */
  message?: string;
  createdAt: string;
}

/** GET /api/schedule -> ScheduledPost[] */
export async function listSchedule(): Promise<ScheduledPost[]> {
  return getJSON<ScheduledPost[]>("/api/schedule");
}

/** DELETE /api/schedule/:id */
export async function cancelSchedule(id: string): Promise<{ ok: boolean }> {
  const r = await fetch(`/api/schedule/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

/**
 * POST /api/schedule/:id/publish-now -> { runId }
 * Publie immédiatement un post déjà programmé, médias persistants inclus
 * (le serveur résout le texte + les pièces jointes depuis le store). À streamer.
 */
export async function publishScheduledNow(id: string): Promise<{ runId: string }> {
  return postJSON<{ runId: string }>(`/api/schedule/${id}/publish-now`, {});
}

/* ──────────────────────────────────────────────────────────────────────────
 * Consommation IA — génération (Hub) + Assistant (Relay), sommée dans la TopBar.
 * ────────────────────────────────────────────────────────────────────────── */

export interface UsageModelTokens {
  input: number;
  output: number;
  calls: number;
}
export type UsageByModel = Record<string, UsageModelTokens>;

/** GET /api/usage — conso de l'Assistant Relay. */
export async function getRelayUsage(): Promise<{ byModel: UsageByModel; since?: string }> {
  return getJSON<{ byModel: UsageByModel; since?: string }>("/api/usage");
}

/** GET /api/hub/usage — conso de la génération (Hub Python, clés snake_case). */
export async function getHubUsage(): Promise<{ by_model: UsageByModel; since?: string }> {
  return getJSON<{ by_model: UsageByModel; since?: string }>("/api/hub/usage");
}

/* ──────────────────────────────────────────────────────────────────────────
 * Édition d'un post programmé + génération d'image (moteur ideal-render).
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * PATCH multipart /api/schedule/:id — modifie un post programmé.
 * FormData (tous optionnels) : publishAt (ISO), message, providers (JSON),
 * whatsapp (JSON), removeMedia (JSON = chemins à retirer), + fichiers `media`.
 */
export async function updateSchedule(id: string, form: FormData): Promise<{ ok: boolean; id: string }> {
  const r = await fetch(`/api/schedule/${id}`, { method: "PATCH", body: form });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

/**
 * POST /api/generate-image — génère un visuel via FLUX (gratuit) et le renvoie
 * en image binaire (Blob), prête à être attachée comme un fichier local.
 */
export async function generateImage(
  prompt: string,
  preset = "ideal",
  size = "1080x1080",
): Promise<Blob> {
  const r = await fetch("/api/generate-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, preset, size }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.blob();
}
