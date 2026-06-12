/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_BACKEND_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type VKAuthResult =
  | { ok: true; access_token: string; user_id: number; expires_in: number }
  | { ok: false; error: string };

declare global {
  interface Window {
    vkmp?: {
      platform: string;
      version: string;
      getBackendUrl: () => Promise<string>;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      setAutoStart: (enabled: boolean, hidden: boolean) => Promise<boolean>;
      getAutoStart: () => Promise<boolean>;
      onMediaKey: (cb: (key: "play-pause" | "next" | "prev") => void) => () => void;
      setTrayInfo: (info: { title: string; artist: string; isPlaying: boolean } | null) => void;
      openVKAuth: () => Promise<VKAuthResult>;
      getVersion: () => Promise<string>;
      updater: {
        checkForUpdates: () => Promise<any>;
        downloadUpdate: () => Promise<any>;
        installUpdate: () => Promise<void>;
        onUpdateAvailable: (cb: (info: any) => void) => void;
        onUpdateNotAvailable: (cb: (info: any) => void) => void;
        onUpdateProgress: (cb: (progress: any) => void) => void;
        onUpdateReady: (cb: () => void) => void;
      };
    };
  }
}
export {};
