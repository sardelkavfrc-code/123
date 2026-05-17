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
