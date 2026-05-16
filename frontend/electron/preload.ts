import { contextBridge, ipcRenderer } from "electron";

type MediaKey = "play-pause" | "next" | "prev";

contextBridge.exposeInMainWorld("vkmp", {
  platform: process.platform,
  version: process.versions.electron,
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke("auto-start:set", enabled),
  getAutoStart: () => ipcRenderer.invoke("auto-start:get"),
  onMediaKey: (cb: (key: MediaKey) => void) => {
    const handler = (_event: unknown, key: MediaKey) => cb(key);
    ipcRenderer.on("media-key", handler);
    return () => ipcRenderer.removeListener("media-key", handler);
  },
  setTrayInfo: (info: { title: string; artist: string; isPlaying: boolean } | null) =>
    ipcRenderer.send("tray:update", info),
});
