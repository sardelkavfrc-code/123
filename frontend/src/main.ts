import { createApp } from "vue";
import { createPinia } from "pinia";
import { MotionPlugin } from "@vueuse/motion";
import App from "./App.vue";
import { router } from "./router";
import { setBackendUrl } from "./api/client";
import { useSettingsStore } from "./stores/settings";
import { vLazyBg } from "./directives/lazyBg";
import "./styles/main.css";

async function bootstrap(): Promise<void> {
  // The packaged Electron app spawns the Python backend on a dynamic port and
  // exposes it via preload. In the browser / Vite dev fallback we keep the
  // build-time default (http://127.0.0.1:8765).
  try {
    const url = await window.vkmp?.getBackendUrl();
    if (url) setBackendUrl(url);
  } catch {
    // ignore — defaults will apply
  }

  const app = createApp(App);
  app.use(createPinia());

  const settings = useSettingsStore();
  settings.applyToDocument();
  void settings.syncAutoStartWithOS();

  app.use(router);
  app.use(MotionPlugin);
  app.directive("lazy-bg", vLazyBg);

  app.mount("#app");
}

void bootstrap();
