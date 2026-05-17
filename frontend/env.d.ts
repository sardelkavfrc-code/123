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

declare global {
  interface Window {
    vkmp?: {
      platform: string;
      version: string;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      setAutoStart: (enabled: boolean) => Promise<boolean>;
      getAutoStart: () => Promise<boolean>;
      onMediaKey: (cb: (key: "play-pause" | "next" | "prev") => void) => () => void;
      setTrayInfo: (info: { title: string; artist: string; isPlaying: boolean } | null) => void;
    };
  }
}
export {};
