// Relay desktop shell (Electron). Spawns the bundled Relay server using
// Electron's own Node, waits for it to be healthy, then opens a window on it.
// The server drives Playwright (bundled Chromium) for the social automation.
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.RELAY_PORT || 3777);
const BASE = `http://127.0.0.1:${PORT}`;
let serverProc = null;

// Resolve a path to bundled resources (packaged) or the repo layout (dev).
function res(...p) {
  return app.isPackaged
    ? path.join(process.resourcesPath, ...p)
    : path.join(__dirname, "..", ...p);
}

function startServer() {
  const serverEntry = res("server", "dist", "index.js");
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(PORT),
    RELAY_WEB_DIST: res("web", "dist"),
    // Per-provider profiles + any future data live in the user's app-data dir.
    RELAY_DATA_DIR: path.join(app.getPath("userData"), "data"),
    // Bundled Playwright browsers (packaged). In dev, Playwright finds its own.
    ...(app.isPackaged ? { PLAYWRIGHT_BROWSERS_PATH: res("ms-playwright") } : {}),
  };
  serverProc = spawn(process.execPath, [serverEntry], { env, stdio: "inherit" });
  serverProc.on("exit", (code) => {
    if (code && code !== 0) console.error(`[relay] server exited (${code})`);
  });
}

function waitForHealth(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      http
        .get(`${BASE}/api/health`, (r) => {
          r.resume();
          if (r.statusCode === 200) resolve();
          else retry();
        })
        .on("error", retry);
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("server did not start in time"));
      else setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0E0F13",
    title: "Relay",
    webPreferences: { contextIsolation: true },
  });
  // External links open in the system browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(BASE)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(BASE);
}

app.whenReady().then(async () => {
  startServer();
  try {
    await waitForHealth();
  } catch (e) {
    console.error("[relay]", e.message);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (serverProc) serverProc.kill();
});
