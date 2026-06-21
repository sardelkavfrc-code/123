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
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const APP_NAME = "VK Music Player";

app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

let backendProc: ChildProcessByStdio<Writable, Readable, Readable> | null = null;
let backendPort = 0;
let backendReady = false;
let backendReadyPromise: Promise<void> | null = null;

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
  if (isDev && VITE_DEV_SERVER_URL) {
    // In Vite dev mode the developer runs `poetry run fastapi dev … --port 8765` themselves.
    backendPort = 8765;
    backendReady = true;
    return;
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
  cleanLegacyRegistry();
  mainWindow = createWindow();
  createTray();
  registerMediaKeys();

  startBackend().catch((err) => {
    console.error("VK Music: failed to start backend", err);
  });

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
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopBackend();
});

// Update setup
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

app.whenReady().then(() => {
  // autoUpdater.checkForUpdates() is triggered by the renderer now
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
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

ipcMain.handle("auth:open-vk-oauth", async (): Promise<OAuthResult> => {
  const oauthWin = new BrowserWindow({
    width: 560,
    height: 760,
    parent: mainWindow ?? undefined,
    modal: false,
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

  const url =
    "https://oauth.vk.com/authorize?" +
    new URLSearchParams({
      client_id: String(VK_OAUTH_CLIENT_ID),
      scope: VK_OAUTH_SCOPE,
      redirect_uri: OAUTH_REDIRECT_PREFIX,
      display: "page",
      v: "5.131",
      response_type: "token",
      revoke: "1",
    }).toString();

  return new Promise<OAuthResult>((resolve) => {
    let settled = false;
    const finalize = (result: OAuthResult) => {
      if (settled) return;
      settled = true;
      try {
        oauthWin.close();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const onUrl = (rawUrl: string) => {
      if (!rawUrl.startsWith(OAUTH_REDIRECT_PREFIX)) return;
      const parsed = parseOAuthFragment(rawUrl);
      if (parsed) finalize(parsed);
    };

    oauthWin.webContents.on("will-redirect", (_e, redirectUrl) => onUrl(redirectUrl));
    oauthWin.webContents.on("did-navigate", (_e, navUrl) => onUrl(navUrl));
    oauthWin.webContents.on("did-navigate-in-page", (_e, navUrl) => onUrl(navUrl));
    oauthWin.on("closed", () => finalize({ ok: false, error: "Окно входа закрыто" }));

    void oauthWin.loadURL(url);
  });
});

ipcMain.handle("auth:open-vk-captcha", async (_event, redirectUrl: string, remixstlid: string) => {
  const cookieVal = String(remixstlid);
  
  try {
    await session.defaultSession.cookies.set({
      url: "https://vk.com",
      name: "remixstlid",
      value: cookieVal,
      domain: ".vk.com",
      path: "/",
      secure: true,
      expirationDate: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    });
    await session.defaultSession.cookies.set({
      url: "https://id.vk.com",
      name: "remixstlid",
      value: cookieVal,
      domain: ".vk.com",
      path: "/",
      secure: true,
      expirationDate: Math.floor(Date.now() / 1000) + 3600 * 24 * 365,
    });
  } catch (err) {
    console.error("Failed to set remixstlid cookie:", err);
  }

  const captchaWin = new BrowserWindow({
    width: 550,
    height: 650,
    parent: mainWindow ?? undefined,
    modal: true,
    autoHideMenuBar: true,
    title: "Подтверждение безопасности",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  captchaWin.removeMenu();

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finalize = (success: boolean) => {
      if (settled) return;
      settled = true;
      try {
        captchaWin.close();
      } catch {
        // ignore
      }
      resolve(success);
    };

    captchaWin.webContents.on("will-redirect", (_e, url) => {
      if (url.includes("blank.html") || url.includes("close")) {
        finalize(true);
      }
    });
    captchaWin.webContents.on("did-navigate", (_e, url) => {
      if (url.includes("blank.html") || url.includes("close")) {
        finalize(true);
      }
    });

    captchaWin.on("closed", () => {
      finalize(true);
    });

    void captchaWin.loadURL(redirectUrl);
  });
});
