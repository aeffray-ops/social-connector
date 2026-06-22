/**
 * Consommation IA de l'Assistant Relay (tokens par modèle), persistée dans
 * ~/.relay/usage.json. Alimente le compteur de conso affiché en haut à droite.
 * (La conso de génération est comptée séparément par le Hub, exposée sur
 *  /api/hub/usage ; le front somme les deux.)
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const DIR = process.env.RELAY_DATA_DIR ?? join(homedir(), ".relay");
const FILE = join(DIR, "usage.json");

export interface UsageModel {
  input: number;
  output: number;
  calls: number;
}
export interface Usage {
  byModel: Record<string, UsageModel>;
  since: string;
}

let current: Usage | null = null;
let writeChain: Promise<void> = Promise.resolve();

async function load(): Promise<Usage> {
  if (current) return current;
  if (existsSync(FILE)) {
    try {
      current = JSON.parse(await readFile(FILE, "utf8")) as Usage;
    } catch {
      current = null;
    }
  }
  if (!current) current = { byModel: {}, since: new Date().toISOString() };
  return current;
}

export async function recordUsage(model: string, input: number, output: number): Promise<void> {
  const u = await load();
  const m = (u.byModel[model || "?"] ??= { input: 0, output: 0, calls: 0 });
  m.input += Math.max(0, Math.round(input || 0));
  m.output += Math.max(0, Math.round(output || 0));
  m.calls += 1;
  const snap = JSON.stringify(u);
  writeChain = writeChain.then(async () => {
    await mkdir(DIR, { recursive: true }).catch(() => {});
    await writeFile(FILE, snap, { mode: 0o600 });
  });
  await writeChain;
}

export async function getUsage(): Promise<Usage> {
  return load();
}
