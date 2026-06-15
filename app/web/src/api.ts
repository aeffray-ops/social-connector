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
