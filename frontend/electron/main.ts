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
import path from "node:path";

const isDev = !app.isPackaged;
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const APP_NAME = "VK Music Player";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
const autoLauncher = new AutoLaunch({ name: APP_NAME, isHidden: true });

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

app.whenReady().then(() => {
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
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
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
