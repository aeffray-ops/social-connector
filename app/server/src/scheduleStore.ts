/**
 * Persistent store of user-scheduled posts (programmation).
 *
 * Mirrors the settings.ts pattern: a single JSON file under ~/.relay (or
 * RELAY_DATA_DIR), mode 600, created on demand, read/written async.
 *
 * GARDE-FOU: the scheduler publishes ONLY what lives here, i.e. content the
 * user has explicitly validated + programmed. Nothing is ever scheduled without
 * an explicit user action.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderId } from "social-connector";

const DIR = process.env.RELAY_DATA_DIR ?? join(homedir(), ".relay");
const FILE = join(DIR, "schedule.json");

export interface ScheduledPost {
  id: string;
  hubContentId: number;
  /** ISO 8601 instant at which the scheduler should publish. */
  publishAt: string;
  providers: ProviderId[];
  whatsapp?: { to?: string; chat?: string };
  /** Absolute paths to persistent media copies (~/.relay/scheduled-media/<id>/). */
  media: string[];
  createdAt: string;
}

let current: ScheduledPost[] = [];
let loaded = false;
/** Serialize writes so concurrent add/remove/update don't clobber the file. */
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<void> {
  if (loaded) return;
  if (existsSync(FILE)) {
    try {
      const parsed = JSON.parse(await readFile(FILE, "utf8"));
      current = Array.isArray(parsed) ? (parsed as ScheduledPost[]) : [];
    } catch {
      current = [];
    }
  }
  loaded = true;
}

function persist(): Promise<void> {
  // Snapshot the array at enqueue time so each write reflects its own state.
  const snapshot = JSON.stringify(current, null, 2);
  writeChain = writeChain.then(async () => {
    await mkdir(DIR, { recursive: true }).catch(() => {});
    await writeFile(FILE, snapshot, { mode: 0o600 });
  });
  return writeChain;
}

export async function listScheduled(): Promise<ScheduledPost[]> {
  await load();
  return current.slice();
}

export async function addScheduled(p: ScheduledPost): Promise<void> {
  await load();
  current.push(p);
  await persist();
}

export async function removeScheduled(id: string): Promise<void> {
  await load();
  current = current.filter((p) => p.id !== id);
  await persist();
}

export async function updateScheduled(
  id: string,
  patch: Partial<ScheduledPost>,
): Promise<void> {
  await load();
  current = current.map((p) => (p.id === id ? { ...p, ...patch, id: p.id } : p));
  await persist();
}
