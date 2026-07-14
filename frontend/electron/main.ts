import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
  globalShortcut,
  shell,
  session,
} from "electron";
import { autoUpdater } from "electron-updater";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const APP_NAME = "VK Music Player";


let DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const _MOBILE_UA = "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Mobile Safari/537.36";

app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("disable-blink-features", "AutomationControlled");

let mainWindow: BrowserWindow | null = null;
let silentAuthWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

let proxyServer: http.Server | null = null;
let proxyPort = 0;

function startProxy(): Promise<number> {
  return new Promise((resolve, reject) => {
    if (proxyServer) {
      resolve(proxyPort);
      return;
    }

    const server = http.createServer((req, res) => {
      try {
        const urlStr = req.url || "";
        if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
          res.writeHead(400);
          res.end("Only absolute URLs are supported by this proxy.");
          return;
        }
        const url = new URL(urlStr);
        const options = {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname + url.search,
          method: req.method,
          headers: req.headers,
        };

        const proxyReq = http.request(options, (proxyRes) => {
          if (res.writableEnded) return;
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        });

        proxyReq.on("error", (err) => {
          if (res.writableEnded) return;
          res.writeHead(502);
          res.end(err.message);
        });

        req.pipe(proxyReq);
      } catch (err: any) {
        if (res.writableEnded) return;
        res.writeHead(500);
        res.end(err.message || "Proxy internal error");
      }
    });

    server.on("connect", (req, clientSocket, head) => {
      try {
        const reqUrl = req.url || "";
        const parts = reqUrl.split(":");
        const hostname = parts[0];
        const port = parseInt(parts[1], 10) || 443;

        const serverSocket = net.connect(port, hostname, () => {
          clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          serverSocket.write(head);
          serverSocket.pipe(clientSocket);
          clientSocket.pipe(serverSocket);
        });

        serverSocket.on("error", () => {
          clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        });

        clientSocket.on("error", () => {
          serverSocket.end();
        });
      } catch {
        clientSocket.end("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      }
    });

    server.on("error", (err) => {
      reject(err);
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        proxyServer = server;
        proxyPort = addr.port;
        console.log(`Electron main proxy listening on port ${proxyPort}`);
        resolve(proxyPort);
      } else {
        reject(new Error("Failed to get proxy server port"));
      }
    });
  });
}

function stopProxy(): void {
  if (proxyServer) {
    try {
      proxyServer.close();
    } catch {
      // ignore
    }
    proxyServer = null;
    proxyPort = 0;
  }
}

let backendProc: ChildProcessByStdio<Writable, Readable, Readable> | null = null;
let backendPort = 0;
let backendReady = false;
let backendReadyPromise: Promise<void> | null = null;

function findDevPython(): string {
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData/Local");
    const poetryCacheDir = path.join(localAppData, "pypoetry/Cache/virtualenvs");
    if (existsSync(poetryCacheDir)) {
      try {
        const dirs = readdirSync(poetryCacheDir);
        const targetDir = dirs.find(d => d.startsWith("vk-music-backend-"));
        if (targetDir) {
          const pythonPath = path.join(poetryCacheDir, targetDir, "Scripts/python.exe");
          if (existsSync(pythonPath)) {
            console.log(`[main] Found virtualenv python: ${pythonPath}`);
            return pythonPath;
          }
        }
      } catch (err) {
        console.error("[main] Failed to scan Poetry cache directory:", err);
      }
    }
  } else {
    const home = os.homedir();
    const poetryCacheDirs = [
      path.join(home, ".cache/pypoetry/virtualenvs"),
      path.join(home, "Library/Caches/pypoetry/virtualenvs")
    ];
    for (const cacheDir of poetryCacheDirs) {
      if (existsSync(cacheDir)) {
        try {
          const dirs = readdirSync(cacheDir);
          const targetDir = dirs.find(d => d.startsWith("vk-music-backend-"));
          if (targetDir) {
            const pythonPath = path.join(cacheDir, targetDir, "bin/python");
            if (existsSync(pythonPath)) {
              console.log(`[main] Found virtualenv python: ${pythonPath}`);
              return pythonPath;
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }
  return "poetry";
}

function findBackendBinary(): string {
  const binaryName = process.platform === "win32" ? "vkmp-backend.exe" : "vkmp-backend";
  // Try dev path
  const devPath = path.join(__dirname, "../../backend/dist/vkmp-backend", binaryName);
  // Try packaged path
  const packagedPath = path.join(process.resourcesPath, "backend", binaryName);

  if (existsSync(packagedPath)) {
    return packagedPath;
  }
  if (existsSync(devPath)) {
    return devPath;
  }
  throw new Error("Backend binary not found. Did you run PyInstaller?");
}

function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Failed to allocate port"));
      }
    });
  });
}

async function startBackend(): Promise<void> {
  const localProxyPort = await startProxy();
  const proxyUrl = `http://127.0.0.1:${localProxyPort}`;

  if (isDev && VITE_DEV_SERVER_URL) {
    backendPort = await pickFreePort();
    const backendDir = path.resolve(__dirname, "../../backend");
    console.log(`[main] Starting backend in dev mode on port ${backendPort}...`);

    const pythonPath = findDevPython();
    const spawnCmd = pythonPath;
    const spawnArgs = pythonPath === "poetry"
      ? ["run", "python", "-m", "app.standalone"]
      : ["-m", "app.standalone"];

    backendProc = spawn(spawnCmd, spawnArgs, {
      cwd: backendDir,
      stdio: ["pipe", "pipe", "pipe"],
      shell: pythonPath === "poetry",
      windowsHide: true,
      env: {
        ...process.env,
        VKMP_BIND_HOST: "127.0.0.1",
        VKMP_BIND_PORT: String(backendPort),
        VKMP_WATCH_PARENT: "1",
        HTTP_PROXY: proxyUrl,
        HTTPS_PROXY: proxyUrl,
        http_proxy: proxyUrl,
        https_proxy: proxyUrl,
        NO_PROXY: "localhost,127.0.0.1",
        no_proxy: "localhost,127.0.0.1",
        PYTHONPATH: ".",
        VKMP_DEV: "1",
      },
    });

    backendReadyPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("backend dev boot timeout")), 30_000);
      backendProc?.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes("VKMP_BACKEND_READY")) {
          clearTimeout(timer);
          backendReady = true;
          resolve();
        }
        const cleanText = text.trim();
        if (cleanText) {
          console.log(`[backend stdout] ${cleanText}`);
        }
      });
      backendProc?.stderr?.on("data", (chunk: Buffer) => {
        const cleanText = chunk.toString().trim();
        if (cleanText) {
          console.error(`[backend stderr] ${cleanText}`);
        }
      });
      backendProc?.on("exit", (code) => {
        clearTimeout(timer);
        backendProc = null;
        if (!backendReady) reject(new Error(`backend dev exited early with code ${code ?? "null"}`));
      });
    });
    return backendReadyPromise;
  }

  const binary = findBackendBinary();
  if (!binary) {
    console.error(
      "VK Music: backend binary not found. Ship the PyInstaller artifact under resources/backend.",
    );
    return;
  }
  backendPort = await pickFreePort();
  backendProc = spawn(binary, [], {
    stdio: ["pipe", "pipe", "pipe"],
    // detached:true puts the backend in its own process group so we can kill
    // it AND any descendants (PyInstaller's bootloader forks a child) in one
    // signal via `process.kill(-pid, signal)` on Linux/macOS.
    detached: process.platform !== "win32",
    windowsHide: true,
    env: {
      ...process.env,
      VKMP_BIND_HOST: "127.0.0.1",
      VKMP_BIND_PORT: String(backendPort),
      VKMP_WATCH_PARENT: "1",
      HTTP_PROXY: proxyUrl,
      HTTPS_PROXY: proxyUrl,
      http_proxy: proxyUrl,
      https_proxy: proxyUrl,
      NO_PROXY: "localhost,127.0.0.1",
      no_proxy: "localhost,127.0.0.1",
    },
  });
  backendReadyPromise = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("backend boot timeout")), 30_000);
    backendProc?.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      if (text.includes("VKMP_BACKEND_READY")) {
        clearTimeout(timer);
        backendReady = true;
        resolve();
      }
      const cleanText = text.trim();
      if (cleanText) {
        console.log(`[backend stdout] ${cleanText}`);
      }
    });
    backendProc?.stderr?.on("data", (chunk: Buffer) => {
      const cleanText = chunk.toString().trim();
      if (cleanText) {
        console.error(`[backend stderr] ${cleanText}`);
      }
    });
    backendProc?.on("exit", (code) => {
      clearTimeout(timer);
      backendProc = null;
      if (!backendReady) reject(new Error(`backend exited early with code ${code ?? "null"}`));
    });
  });
  return backendReadyPromise;
}

function stopBackend(): void {
  if (!backendProc) return;
  const proc = backendProc;
  backendProc = null;
  try {
    // Closing stdin triggers VKMP_WATCH_PARENT shutdown as a fallback signal.
    proc.stdin?.end();
  } catch {
    // ignore
  }
  try {
    if (process.platform === "win32") {
      // taskkill /T kills the whole tree so PyInstaller's bootloader + uvicorn
      // child both exit even if the bootloader didn't forward SIGTERM.
      if (proc.pid) {
        spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        proc.kill();
      }
    } else if (proc.pid) {
      // detached spawn put us in our own process group; negate the PID to kill the group.
      process.kill(-proc.pid, "SIGTERM");
      setTimeout(() => {
        try {
          process.kill(-proc.pid!, "SIGKILL");
        } catch {
          // already dead
        }
      }, 2_000).unref();
    } else {
      proc.kill();
    }
  } catch {
    // ignore — process may already be gone
  }
}

function cleanLegacyRegistry(): void {
  if (process.platform !== "win32") return;
  try {
    spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-Command",
        'Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" -Name "VK Music" -ErrorAction SilentlyContinue',
      ],
      { stdio: "ignore", windowsHide: true },
    );
  } catch (err) {
    console.error("VK Music: failed to clean legacy registry key", err);
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#0c0d11",
    frame: false,
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  win.once("ready-to-show", () => {
    const isHidden =
      process.argv.includes("--hidden") ||
      app.commandLine.hasSwitch("hidden") ||
      (process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAsHidden);
    if (!isHidden) {
      win.show();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (VITE_DEV_SERVER_URL) {
    void win.loadURL(VITE_DEV_SERVER_URL);
    if (isDev) {
      win.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void win.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  win.on("close", (event) => {
    if (!isQuitting && tray) {
      event.preventDefault();
      win.hide();
    }
  });

  return win;
}

function buildTrayMenu(info: { title: string; artist: string; isPlaying: boolean } | null) {
  const label = info
    ? `${info.isPlaying ? "▶" : "❚❚"}  ${info.artist} — ${info.title}`.slice(0, 80)
    : "Ничего не играет";

  return Menu.buildFromTemplate([
    { label, enabled: false },
    { type: "separator" },
    {
      label: info?.isPlaying ? "Пауза" : "Воспроизвести",
      click: () => mainWindow?.webContents.send("media-key", "play-pause"),
    },
    { label: "След.", click: () => mainWindow?.webContents.send("media-key", "next") },
    { label: "Пред.", click: () => mainWindow?.webContents.send("media-key", "prev") },
    { type: "separator" },
    {
      label: "Показать",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: "Выйти",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  const publicIcon = path.join(__dirname, "../public/icon.png");
  const distIcon = path.join(__dirname, "../dist/icon.png");
  let icon = nativeImage.createEmpty();
  if (existsSync(publicIcon)) {
    icon = nativeImage.createFromPath(publicIcon);
  } else if (existsSync(distIcon)) {
    icon = nativeImage.createFromPath(distIcon);
  }
  tray = new Tray(icon);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(buildTrayMenu(null));
  tray.on("click", () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
}

function registerMediaKeys() {
  globalShortcut.register("MediaPlayPause", () => {
    mainWindow?.webContents.send("media-key", "play-pause");
  });
  globalShortcut.register("MediaNextTrack", () => {
    mainWindow?.webContents.send("media-key", "next");
  });
  globalShortcut.register("MediaPreviousTrack", () => {
    mainWindow?.webContents.send("media-key", "prev");
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", (event, commandLine) => {
  // If the second instance was launched with --hidden, do not show the window.
  // This avoids flashing/opening the window when multiple registry startup keys trigger.
  const isHidden = commandLine.includes("--hidden") || commandLine.includes("-hidden");
  if (isHidden) {
    return;
  }

  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  startBackend().catch((err) => {
    console.error("VK Music: failed to start backend", err);
  });

  try {
    DESKTOP_UA = session.defaultSession.getUserAgent()
      .replace(/Electron\/[\d.]+\s?/g, "")
      .replace(/vk-music-player\/[\d.]+\s?/gi, "")
      .trim();
  } catch (err) {
    console.error("Failed to update desktop UA:", err);
  }

  setTimeout(() => {
    cleanLegacyRegistry();
  }, 5000);
  mainWindow = createWindow();
  createTray();
  registerMediaKeys();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on("window-all-closed", () => {
  // Keep app alive when tray is present (macOS/Linux/Windows). Quit only when user explicitly quits.
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackend();
  stopProxy();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopBackend();
  stopProxy();
});

// Update setup
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

function initSilentAuthWin() {
  if (silentAuthWin) return;
  silentAuthWin = new BrowserWindow({
    width: 560,
    height: 760,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      partition: `persist:vk-oauth-${VK_OAUTH_CLIENT_ID}`,
    },
  });
  silentAuthWin.webContents.setUserAgent(DESKTOP_UA);
  
  const ses = session.fromPartition(`persist:vk-oauth-${VK_OAUTH_CLIENT_ID}`);
  ses.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    if (
      details.resourceType === "image" ||
      details.resourceType === "font" ||
      details.url.includes("google-analytics") ||
      details.url.includes("yandex.ru") ||
      details.url.includes("mail.ru")
    ) {
      callback({ cancel: true });
    } else {
      callback({ cancel: false });
    }
  });
  
  const url =
    "https://oauth.vk.com/authorize?" +
    new URLSearchParams({
      client_id: String(VK_OAUTH_CLIENT_ID),
      scope: VK_OAUTH_SCOPE,
      redirect_uri: OAUTH_REDIRECT_PREFIX,
      display: "page",
      v: "5.131",
      response_type: "token",
      revoke: "0",
    }).toString();
    
  void silentAuthWin.loadURL(url);
}

app.whenReady().then(() => {
  initSilentAuthWin();
});

autoUpdater.on("update-available", (info) => {
  mainWindow?.webContents.send("update:available", info);
});
autoUpdater.on("update-not-available", (info) => {
  mainWindow?.webContents.send("update:not-available", info);
});
autoUpdater.on("download-progress", (progress) => {
  mainWindow?.webContents.send("update:progress", progress);
});
autoUpdater.on("update-downloaded", () => {
  mainWindow?.webContents.send("update:ready");
});

ipcMain.handle("update:check", async () => {
  const result = await autoUpdater.checkForUpdates();
  const hasUpdate = result ? result.updateInfo.version !== app.getVersion() : false;
  if (hasUpdate && result) {
    mainWindow?.webContents.send("update:available", result.updateInfo);
  }
  return { hasUpdate };
});
ipcMain.handle("update:download", () => autoUpdater.downloadUpdate());
ipcMain.handle("update:install", () => {
  isQuitting = true;
  stopBackend();
  stopProxy();
  // isSilent: true, isForceRunAfter: true
  autoUpdater.quitAndInstall(true, true);
});

ipcMain.handle("backend:url", () => `http://127.0.0.1:${backendPort}`);
ipcMain.handle("backend:wait", async () => {
  if (backendReadyPromise) {
    await backendReadyPromise;
  }
});
ipcMain.handle("app:version", () => app.getVersion());

ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on("window:close", () => mainWindow?.close());

ipcMain.handle("auto-start:get", () => {
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle("auto-start:set", (_event, enabled: boolean, hidden: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: hidden ? ["--hidden"] : [],
  });
  return true;
});

ipcMain.on("tray:update", (_event, info: { title: string; artist: string; isPlaying: boolean } | null) => {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu(info));
  tray.setToolTip(info ? `${info.artist} — ${info.title}` : APP_NAME);
});

type OAuthResult =
  | { ok: true; access_token: string; user_id: number; expires_in: number }
  | { ok: false; error: string };

// Single working auth path: vk.com web client (the "vk.com" button on
// vkhost.github.io). client_id 6287487 + scope 1073737727 ("everything")
// is the only combination that still yields tokens with audio.* access
// in 2026; every other documented client returns "Unknown method passed".
const VK_OAUTH_CLIENT_ID = 6287487;
const VK_OAUTH_SCOPE = "1073737727";
const OAUTH_REDIRECT_PREFIX = "https://oauth.vk.com/blank.html";


function parseOAuthFragment(rawUrl: string): OAuthResult | null {
  const hashIndex = rawUrl.indexOf("#");
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(rawUrl.slice(hashIndex + 1));
  const error = params.get("error");
  if (error) return { ok: false, error: params.get("error_description") || error };
  const token = params.get("access_token");
  if (!token) return null;
  return {
    ok: true,
    access_token: token,
    user_id: Number(params.get("user_id") || 0),
    expires_in: Number(params.get("expires_in") || 0),
  };
}

ipcMain.handle("auth:open-vk-oauth", async (_event, silent?: boolean): Promise<OAuthResult> => {
  let oauthWin: BrowserWindow;
  if (silent && silentAuthWin && !silentAuthWin.isDestroyed()) {
    oauthWin = silentAuthWin;
    // Clear all previous listeners from pre-warmed window
    oauthWin.webContents.removeAllListeners("will-redirect");
    oauthWin.webContents.removeAllListeners("did-redirect-navigation");
    oauthWin.webContents.removeAllListeners("did-navigate");
    oauthWin.webContents.removeAllListeners("did-navigate-in-page");
    oauthWin.webContents.removeAllListeners("did-start-navigation");
    oauthWin.webContents.removeAllListeners("did-frame-navigate");
    oauthWin.webContents.removeAllListeners("dom-ready");
    oauthWin.webContents.removeAllListeners("did-fail-load");
    oauthWin.webContents.session.cookies.removeAllListeners("changed");
  } else {
    oauthWin = new BrowserWindow({
      width: 560,
      height: 760,
      parent: mainWindow ?? undefined,
      modal: false,
      show: !silent,
      autoHideMenuBar: true,
      title: "Вход в ВК",
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        partition: `persist:vk-oauth-${VK_OAUTH_CLIENT_ID}`,
      },
    });
    oauthWin.webContents.setUserAgent(DESKTOP_UA);
    oauthWin.removeMenu();
  }

  const url =
    "https://oauth.vk.com/authorize?" +
    new URLSearchParams({
      client_id: String(VK_OAUTH_CLIENT_ID),
      scope: VK_OAUTH_SCOPE,
      redirect_uri: OAUTH_REDIRECT_PREFIX,
      display: "page",
      v: "5.131",
      response_type: "token",
      revoke: silent ? "0" : "1",
    }).toString();

  return new Promise<OAuthResult>((resolve) => {
    let settled = false;

    // Polling safety interval to ensure we capture URL changes (e.g. on client-side hash redirection)
    const checkInterval = setInterval(() => {
      try {
        if (!oauthWin || oauthWin.isDestroyed()) {
          clearInterval(checkInterval);
          return;
        }
        const currentUrl = oauthWin.webContents.getURL();
        onUrl(currentUrl);
      } catch (err) {
        clearInterval(checkInterval);
      }
    }, 250);

    const finalize = (result: OAuthResult) => {
      if (settled) return;
      settled = true;
      clearInterval(checkInterval);
      if (silentTimeout) clearTimeout(silentTimeout);
      try {
        if (!silent) oauthWin.close();
      } catch {
        // ignore
      }
      resolve(result);
    };

    let silentTimeout: NodeJS.Timeout | null = null;
    if (silent) {
      silentTimeout = setTimeout(() => {
        if (!settled) finalize({ ok: false, error: "Silent auth timeout" });
      }, 5000);
    }

    let tokenExpiredRetries = 0;

    const onUrl = (rawUrl: string) => {
      if (!rawUrl) return;
      if (!rawUrl.startsWith(OAUTH_REDIRECT_PREFIX)) return;
      const parsed = parseOAuthFragment(rawUrl);
      if (parsed) {
        if (!parsed.ok && parsed.error === "token_expired" && tokenExpiredRetries < 2) {
          tokenExpiredRetries++;
          setTimeout(() => {
            if (!oauthWin.isDestroyed()) {
              void oauthWin.loadURL(url);
            }
          }, 500);
          return;
        }
        finalize(parsed);
      }
    };

    // Monitor session cookies to force authorization completion if 2FA login page hangs/fails to redirect
    oauthWin.webContents.session.cookies.on("changed", (_event, cookie, _cause, removed) => {
      if (!removed && cookie.domain && cookie.domain.includes(".vk.com") && cookie.name.startsWith("remixsid")) {
        // Wait a short time to allow natural redirects, then force redirect to complete OAuth flow
        setTimeout(() => {
          try {
            if (!oauthWin.isDestroyed()) {
              const currentUrl = oauthWin.webContents.getURL();
              if (!currentUrl.startsWith(OAUTH_REDIRECT_PREFIX)) {
                void oauthWin.loadURL(url.replace("revoke=1", "revoke=0"));
              }
            }
          } catch (e) {
            // ignore
          }
        }, 800);
      }
    });

    // Events for all forms of navigation, redirects, and subframe routing
    oauthWin.webContents.on("will-redirect", (_e, redirectUrl) => onUrl(redirectUrl));
    oauthWin.webContents.on("did-redirect-navigation", (_e, redirectUrl) => onUrl(redirectUrl));
    oauthWin.webContents.on("did-navigate", (_e, navUrl) => onUrl(navUrl));
    oauthWin.webContents.on("did-navigate-in-page", (_e, navUrl) => onUrl(navUrl));
    oauthWin.webContents.on("did-start-navigation", (_e, navUrl) => onUrl(navUrl));
    oauthWin.webContents.on("did-frame-navigate", (_e, navUrl) => onUrl(navUrl));
    
    const injectClicker = async () => {
      try {
        if (oauthWin.isDestroyed()) return;
        const currentUrl = oauthWin.webContents.getURL();
        onUrl(currentUrl);
        
        if (silent && currentUrl.includes("vk.com")) {
          await oauthWin.webContents.executeJavaScript(`
            (function() {
              const tryClick = () => {
                const btn = document.querySelector('.oauth_button_allow, button.flat_button, button[type="submit"], .vkuiButton, .vkc__Button__primary');
                if (btn && btn.offsetHeight > 0) {
                  btn.click();
                  return true;
                }
                return false;
              };
              if (!tryClick()) {
                const obs = new MutationObserver(() => {
                  if (tryClick()) obs.disconnect();
                });
                if (document.body) {
                  obs.observe(document.body, { childList: true, subtree: true });
                } else {
                  document.addEventListener('DOMContentLoaded', () => {
                    obs.observe(document.body, { childList: true, subtree: true });
                  });
                }
              }
            })();
          `).catch(() => {});
        }
      } catch {
        // ignore
      }
    };

    // Check URL state when DOM is ready (faster than did-stop-loading)
    oauthWin.webContents.on("dom-ready", injectClicker);

    // Close window and report error if loading main page fails (e.g. DNS or connection issue)
    oauthWin.webContents.on("did-fail-load", (_e, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (isMainFrame) {
        finalize({
          ok: false,
          error: `Не удалось загрузить страницу авторизации VK (${errorDescription}, код ${errorCode}). Проверьте интернет-соединение.`,
        });
      }
    });

    if (silent && oauthWin === silentAuthWin && oauthWin.webContents.getURL().includes("vk.com")) {
      // It's already loaded, just inject the clicker!
      void injectClicker();
    } else {
      void oauthWin.loadURL(url);
    }

    oauthWin.on("closed", () => finalize({ ok: false, error: "Окно входа закрыто" }));
  });
});

ipcMain.handle("auth:open-vk-validation", async (_event, url: string): Promise<string | null> => {
  const win = new BrowserWindow({
    width: 560,
    height: 700,
    parent: mainWindow ?? undefined,
    modal: true,
    show: true,
    autoHideMenuBar: true,
    title: "Подтверждение входа VK",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.removeMenu();

  let successToken: string | null = null;
  let resolved = false;

  return new Promise<string | null>((resolve) => {
    win.webContents.on("console-message", (event, level, message) => {
      if (message.startsWith("SUCCESS_TOKEN_INTERCEPTED:")) {
        successToken = message.substring("SUCCESS_TOKEN_INTERCEPTED:".length);
      }
      if (message.startsWith("VALIDATION_FINISHED")) {
        resolved = true;
        win.close();
        resolve(successToken);
      }
    });

    win.webContents.on("dom-ready", () => {
      const script = `
        (function() {
          if (window.__fetchIntercepted) return;
          window.__fetchIntercepted = true;
          const originalFetch = window.fetch;
          window.fetch = function(...args) {
            const url = args[0] ? String(args[0]) : "";
            return originalFetch.apply(this, args).then(response => {
              response.clone().json().then(data => {
                const token = data?.response?.success_token || data?.success_token;
                if (token) {
                  console.log("SUCCESS_TOKEN_INTERCEPTED:" + token);
                }
                if (url.includes("leaveCaptcha") || url.includes("endSession")) {
                  console.log("VALIDATION_FINISHED");
                }
              }).catch(() => {});
              return response;
            });
          };
        })();
      `;
      win.webContents.executeJavaScript(script).catch(() => {});
    });

    win.on("closed", () => {
      if (!resolved) {
        resolve(null);
      }
    });

    win.loadURL(url);
  });
});

