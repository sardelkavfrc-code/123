import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Tray,
  globalShortcut,
  shell,
} from "electron";
import AutoLaunch from "auto-launch";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import type { Readable, Writable } from "node:stream";

const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const APP_NAME = "VK Music Player";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const autoLauncher = new AutoLaunch({ name: APP_NAME, isHidden: true });

let backendProc: ChildProcessByStdio<Writable, Readable, Readable> | null = null;
let backendPort = 0;
let backendReady = false;

function findBackendBinary(): string | null {
  const exe = process.platform === "win32" ? "vkmp-backend.exe" : "vkmp-backend";
  const candidates = [
    // Packaged builds copy the binary into resources/backend/<exe> via electron-builder extraResources.
    path.join(process.resourcesPath, "backend", exe),
    // Local "dist" runs without electron-builder still pick up the PyInstaller output.
    path.join(__dirname, "..", "..", "backend", "dist", exe),
    path.join(__dirname, "..", "backend", "dist", exe),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
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
  await new Promise<void>((resolve, reject) => {
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
    },
  });

  win.once("ready-to-show", () => {
    win.show();
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
  const icon = nativeImage.createEmpty();
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

app.whenReady().then(async () => {
  try {
    await startBackend();
  } catch (err) {
    console.error("VK Music: failed to start backend", err);
  }
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
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  stopBackend();
});

ipcMain.handle("backend:url", () => `http://127.0.0.1:${backendPort}`);

type OAuthResult =
  | { ok: true; access_token: string; user_id: number | null; expires_in: number | null }
  | { ok: false; reason: "cancelled" | "error" | "load_failed"; message?: string };

/**
 * Kate Mobile client id — same one the rest of the open-source VK clients use.
 * The implicit OAuth flow on the mobile web page handles login + 2FA + captcha +
 * QR/VK ID for us, so the desktop app never sees the password.
 */
const KATE_CLIENT_ID = "2685278";
const OAUTH_REDIRECT_PREFIX = "https://oauth.vk.com/blank.html";
const OAUTH_SCOPE = "audio,friends,offline,status";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 11; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko)" +
  " Chrome/120.0.0.0 Mobile Safari/537.36 KateMobileAndroid/97 lite-636 (Android 11; SDK 30; arm64-v8a; SM-G960F; ru)";

function parseOAuthFragment(url: string): {
  access_token?: string;
  user_id?: string;
  expires_in?: string;
  error?: string;
  error_description?: string;
} {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return {};
  const fragment = url.slice(hashIndex + 1);
  const params = new URLSearchParams(fragment);
  const out: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

ipcMain.handle("auth:open-vk-oauth", async (): Promise<OAuthResult> => {
  // Each call gets a fresh in-memory partition so old VK cookies don't auto-log
  // us in as the wrong account — the user always lands on the login screen.
  const partition = `oauth-${Date.now()}`;
  const oauthWindow = new BrowserWindow({
    parent: mainWindow ?? undefined,
    modal: false,
    width: 460,
    height: 720,
    minWidth: 400,
    minHeight: 600,
    title: "Войти через ВК",
    backgroundColor: "#ffffff",
    autoHideMenuBar: true,
    webPreferences: {
      partition,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  // Pretend to be the Kate Mobile Android app so VK serves the mobile login UI
  // (includes the "Войти через VK ID" → QR-code path, plus 2FA and captcha).
  oauthWindow.webContents.setUserAgent(MOBILE_UA);

  const authorizeUrl = new URL("https://oauth.vk.com/authorize");
  authorizeUrl.searchParams.set("client_id", KATE_CLIENT_ID);
  authorizeUrl.searchParams.set("scope", OAUTH_SCOPE);
  authorizeUrl.searchParams.set("redirect_uri", OAUTH_REDIRECT_PREFIX);
  authorizeUrl.searchParams.set("display", "mobile");
  authorizeUrl.searchParams.set("response_type", "token");
  authorizeUrl.searchParams.set("revoke", "1");
  authorizeUrl.searchParams.set("v", "5.131");

  return new Promise<OAuthResult>((resolve) => {
    let settled = false;
    const settle = (result: OAuthResult) => {
      if (settled) return;
      settled = true;
      if (!oauthWindow.isDestroyed()) {
        oauthWindow.close();
      }
      resolve(result);
    };

    const handleRedirect = (url: string): boolean => {
      if (!url.startsWith(OAUTH_REDIRECT_PREFIX)) return false;
      const parts = parseOAuthFragment(url);
      if (parts.access_token) {
        settle({
          ok: true,
          access_token: parts.access_token,
          user_id: parts.user_id ? Number(parts.user_id) : null,
          expires_in: parts.expires_in ? Number(parts.expires_in) : null,
        });
        return true;
      }
      if (parts.error) {
        settle({
          ok: false,
          reason: "error",
          message: parts.error_description || parts.error,
        });
        return true;
      }
      return false;
    };

    oauthWindow.webContents.on("will-redirect", (event, url) => {
      if (handleRedirect(url)) {
        event.preventDefault();
      }
    });
    oauthWindow.webContents.on("did-redirect-navigation", (_event, url) => {
      handleRedirect(url);
    });
    oauthWindow.webContents.on("will-navigate", (event, url) => {
      if (handleRedirect(url)) {
        event.preventDefault();
      }
    });
    oauthWindow.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL) => {
        // -3 ABORTED fires when we cancel a redirect ourselves above; ignore it.
        if (errorCode === -3) return;
        if (validatedURL.startsWith(OAUTH_REDIRECT_PREFIX)) return;
        settle({
          ok: false,
          reason: "load_failed",
          message: `${errorDescription || "Ошибка загрузки"} (${errorCode})`,
        });
      },
    );

    oauthWindow.on("closed", () => {
      settle({ ok: false, reason: "cancelled" });
    });

    void oauthWindow.loadURL(authorizeUrl.toString());
  });
});

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

ipcMain.handle("auto-start:get", async () => {
  try {
    return await autoLauncher.isEnabled();
  } catch {
    return false;
  }
});

ipcMain.handle("auto-start:set", async (_event, enabled: boolean) => {
  try {
    if (enabled) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }
    return true;
  } catch {
    return false;
  }
});

ipcMain.on("tray:update", (_event, info: { title: string; artist: string; isPlaying: boolean } | null) => {
  if (!tray) return;
  tray.setContextMenu(buildTrayMenu(info));
  tray.setToolTip(info ? `${info.artist} — ${info.title}` : APP_NAME);
});
