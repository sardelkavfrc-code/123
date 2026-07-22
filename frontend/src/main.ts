import { createApp } from "vue";
import { createPinia } from "pinia";

window.addEventListener("error", (event) => {
  const payload = {
    message: event.message,
    stack: event.error?.stack || null,
  };
  const send = (url: string) => {
    fetch(`${url}/local/log_error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };
  if (window.vkmp?.getBackendUrl) {
    window.vkmp.getBackendUrl().then((url) => {
      send(url || "http://127.0.0.1:8765");
    }).catch(() => send("http://127.0.0.1:8765"));
  } else {
    send("http://127.0.0.1:8765");
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const payload = {
    message: String(event.reason?.message || event.reason),
    stack: event.reason?.stack || null,
  };
  const send = (url: string) => {
    fetch(`${url}/local/log_error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  };
  if (window.vkmp?.getBackendUrl) {
    window.vkmp.getBackendUrl().then((url) => {
      send(url || "http://127.0.0.1:8765");
    }).catch(() => send("http://127.0.0.1:8765"));
  } else {
    send("http://127.0.0.1:8765");
  }
});
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

  await router.isReady();
  app.mount("#app");
}

void bootstrap();
