/**
 * Sidecar manager for the IDEAL content Hub (Python / FastAPI).
 *
 * Relay drives the Hub as a child process so the user only ever launches Relay.
 * The Hub stays the generation brain (prompts + garde-fous untouched); Relay
 * proxies it under /api/hub/* (see routes/content.ts).
 *
 * - startHub(): reuse an already-running Hub if /api/health answers, else spawn
 *   uvicorn from the Hub's own venv and wait until it's healthy.
 * - hubBaseUrl(): http://127.0.0.1:<port> (the proxy appends /api/...).
 * - stopHub(): kill the child ONLY if we spawned it.
 *
 * Robust by design: a missing venv/python logs a clear warning and never
 * crashes Relay — the proxy then surfaces a handled 502 "Hub indisponible".
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";

const HUB_DIR = "C:\\Users\\aurel\\ideal-content-hub";
const HUB_BACKEND = `${HUB_DIR}\\backend`;
const HUB_PYTHON = `${HUB_DIR}\\.venv\\Scripts\\python.exe`;

function hubPort(): number {
  return Number(process.env.RELAY_HUB_PORT ?? 8000);
}

export function hubBaseUrl(): string {
  return `http://127.0.0.1:${hubPort()}`;
}

/** Our spawned child, if any. null when we reused an already-running Hub. */
let child: ChildProcess | null = null;

/** True once a /api/health probe returns ok. */
async function ping(timeoutMs = 1500): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${hubBaseUrl()}/api/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Ensures a healthy Hub is reachable on the configured port.
 * Reuses a running instance; otherwise spawns uvicorn from the Hub venv and
 * polls /api/health (~30s timeout). Never throws: failures log a warning so
 * Relay keeps serving (the proxy reports 502 if the Hub never comes up).
 */
export async function startHub(): Promise<void> {
  if (await ping()) {
    console.log(`[Relay] Hub already running on ${hubBaseUrl()} — reusing.`);
    return;
  }

  if (!existsSync(HUB_PYTHON)) {
    console.warn(
      `[Relay] Hub Python introuvable (${HUB_PYTHON}). ` +
        `Le Hub ne sera pas démarré ; /api/hub/* renverra 502 tant qu'il est absent.`,
    );
    return;
  }

  try {
    child = spawn(
      HUB_PYTHON,
      ["-m", "uvicorn", "main:app", "--port", String(hubPort())],
      { cwd: HUB_BACKEND, stdio: "ignore", windowsHide: true },
    );
  } catch (e) {
    console.warn(`[Relay] Échec du spawn du Hub : ${(e as Error).message}`);
    child = null;
    return;
  }

  child.on("error", (e) => {
    console.warn(`[Relay] Erreur du process Hub : ${e.message}`);
  });
  child.on("exit", (code) => {
    if (code != null && code !== 0) console.warn(`[Relay] Le Hub s'est arrêté (code ${code}).`);
    child = null;
  });

  // Poll until healthy (~30s).
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await ping()) {
      console.log(`[Relay] Hub démarré sur ${hubBaseUrl()}.`);
      return;
    }
    await sleep(500);
  }
  console.warn(`[Relay] Le Hub n'a pas répondu sous 30s sur ${hubBaseUrl()}.`);
}

/** Kills the Hub child if (and only if) we spawned it. No-op otherwise. */
export function stopHub(): void {
  if (child && !child.killed) {
    child.kill();
  }
  child = null;
}
