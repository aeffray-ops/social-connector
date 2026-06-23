/**
 * Génération d'image via le moteur maison « ideal-render » (FLUX / Pollinations,
 * gratuit, sans clé). On lance le script Python en sous-processus, on lit l'image
 * produite dans un dossier temporaire, et on la renvoie telle quelle au front,
 * qui l'attache ensuite comme un fichier normal (donc elle passe par le pipeline
 * de publication/simulation existant, sans stockage média supplémentaire).
 *
 * Configurable par env :
 *   RELAY_PYTHON         — interpréteur Python (défaut : venv du Hub).
 *   RELAY_RENDER_SCRIPT  — chemin du script ideal_render.py (défaut : le skill).
 */
import { Router } from "express";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";

// Le chemin FLUX d'ideal_render n'utilise que la stdlib → n'importe quel Python 3
// convient ; on réutilise le venv du Hub, garanti présent sur cette machine.
const PY =
  process.env.RELAY_PYTHON ??
  "C:\\Users\\aurel\\ideal-content-hub\\.venv\\Scripts\\python.exe";
const SCRIPT =
  process.env.RELAY_RENDER_SCRIPT ??
  "C:\\Users\\aurel\\OneDrive\\Documents\\Claude\\Projects\\IDEAL HOME PROJECT\\.claude\\skills\\ideal-render\\ideal_render.py";

const ALLOWED_SIZES = new Set(["1080x1080", "1080x1350", "1536x1024"]);
const ALLOWED_PRESETS = new Set([
  "ideal", "scandinave", "contemporain", "luxe", "industriel",
  "haussmannien", "bord-de-bassin", "minimaliste", "none",
]);

export function renderRouter(): Router {
  const r = Router();

  // POST /api/generate-image  { prompt, preset?, size? } -> image/jpeg (bytes)
  r.post("/generate-image", async (req, res) => {
    const prompt = String(req.body?.prompt ?? "").trim();
    if (!prompt) return res.status(400).json({ error: "Décris le visuel à générer (prompt vide)." });
    const preset = ALLOWED_PRESETS.has(String(req.body?.preset)) ? String(req.body.preset) : "ideal";
    const size = ALLOWED_SIZES.has(String(req.body?.size)) ? String(req.body.size) : "1080x1080";

    let outDir: string | null = null;
    try {
      outDir = await mkdtemp(join(tmpdir(), "relay-render-"));
      const args = [SCRIPT, "-p", prompt, "-s", preset, "--size", size, "--out-dir", outDir];

      await new Promise<void>((resolveRun, reject) => {
        const proc = spawn(PY, args, { cwd: dirname(SCRIPT) });
        let stderr = "";
        const timer = setTimeout(() => {
          proc.kill();
          reject(new Error("génération trop longue (le service FLUX est peut-être surchargé, réessaie)."));
        }, 180_000);
        proc.stderr.on("data", (d) => { stderr += d.toString(); });
        proc.on("error", (e) => { clearTimeout(timer); reject(e); });
        proc.on("close", (code) => {
          clearTimeout(timer);
          if (code === 0) return resolveRun();
          const last = stderr.trim().split("\n").pop() || "";
          reject(new Error(last || `le moteur d'image a échoué (code ${code}).`));
        });
      });

      // Première image (.jpg/.png) produite dans le dossier temporaire.
      const produced = (await readdir(outDir)).filter((f) => /\.(jpe?g|png)$/i.test(f));
      const name = produced[0];
      if (!name) throw new Error("aucune image produite.");
      const buf = await readFile(join(outDir, name));
      res.set("content-type", name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
      res.send(buf);
    } catch (e) {
      res.status(502).json({ error: `Génération d'image impossible : ${(e as Error).message}` });
    } finally {
      if (outDir) await rm(outDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  return r;
}
