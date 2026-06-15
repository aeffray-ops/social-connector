// Stages a self-contained Relay server for electron-builder:
//  staging/server         — compiled server + prod node_modules + the lib
//                           (materialized from `npm pack`, no symlink)
//  staging/ms-playwright   — bundled Chromium for the automation
// Run by `npm run dist` and by CI before electron-builder.
import { execSync } from "node:child_process";
import { rmSync, mkdirSync, cpSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = dirname(fileURLToPath(import.meta.url));
const root = join(desktop, "..", "..");
const serverSrc = join(root, "app", "server");
const staging = join(desktop, "staging");
const sserver = join(staging, "server");
const browsers = join(staging, "ms-playwright");

const run = (cmd, cwd, env) =>
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, ...env } });

console.log("• clean staging");
rmSync(staging, { recursive: true, force: true });
mkdirSync(sserver, { recursive: true });

console.log("• build lib / server / web");
run("npm run build", root); // lib -> dist (also via prepare, but be explicit)
run("npm run build", serverSrc); // server -> dist
run("npm run build", join(root, "app", "web")); // web -> dist

console.log("• pack the library (materialize, no file: symlink)");
const tgz = execSync("npm pack --silent", { cwd: root }).toString().trim();
const libTarball = join(root, tgz);

console.log("• stage server (dist + prod package.json)");
cpSync(join(serverSrc, "dist"), join(sserver, "dist"), { recursive: true });
const pkg = JSON.parse(readFileSync(join(serverSrc, "package.json"), "utf8"));
pkg.dependencies["social-connector"] = `file:${libTarball}`;
delete pkg.devDependencies;
delete pkg.scripts;
writeFileSync(join(sserver, "package.json"), JSON.stringify(pkg, null, 2));

console.log("• prod install in staging/server");
run("npm install --omit=dev --no-audit --no-fund", sserver);

console.log("• download Chromium into staging/ms-playwright");
run("npx playwright install chromium", sserver, { PLAYWRIGHT_BROWSERS_PATH: browsers });

console.log("• cleanup packed tarball");
rmSync(libTarball, { force: true });

const browserDirs = readdirSync(browsers).filter((d) => d.startsWith("chromium"));
console.log(`✓ staged server + chromium (${browserDirs.join(", ") || "none?"})`);
