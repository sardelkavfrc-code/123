import { contextBridge, ipcRenderer } from "electron";

type MediaKey = "play-pause" | "next" | "prev";

contextBridge.exposeInMainWorld("vkmp", {
  platform: process.platform,
  version: process.versions.electron,
  getBackendUrl: () => ipcRenderer.invoke("backend:url"),
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  setAutoStart: (enabled: boolean, hidden: boolean) => ipcRenderer.invoke("auto-start:set", enabled, hidden),
  getAutoStart: () => ipcRenderer.invoke("auto-start:get"),
  onMediaKey: (cb: (key: MediaKey) => void) => {
    const handler = (_event: unknown, key: MediaKey) => cb(key);
    ipcRenderer.on("media-key", handler);
    return () => ipcRenderer.removeListener("media-key", handler);
  },
  setTrayInfo: (info: { title: string; artist: string; isPlaying: boolean } | null) =>
    ipcRenderer.send("tray:update", info),
  openVKAuth: () => ipcRenderer.invoke("auth:open-vk-oauth"),
  getVersion: () => ipcRenderer.invoke("app:version"),
  
  updater: {
    checkForUpdates: () => ipcRenderer.invoke("update:check"),
    downloadUpdate: () => ipcRenderer.invoke("update:download"),
    installUpdate: () => ipcRenderer.invoke("update:install"),
    onUpdateAvailable: (cb: (info: any) => void) => {
      ipcRenderer.on("update:available", (_e, info) => cb(info));
    },
    onUpdateNotAvailable: (cb: (info: any) => void) => {
      ipcRenderer.on("update:not-available", (_e, info) => cb(info));
    },
    onUpdateProgress: (cb: (progress: any) => void) => {
      ipcRenderer.on("update:progress", (_e, progress) => cb(progress));
    },
    onUpdateReady: (cb: () => void) => {
      ipcRenderer.on("update:ready", () => cb());
    },
  }
});
