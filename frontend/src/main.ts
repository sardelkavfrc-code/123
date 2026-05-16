import { createApp } from "vue";
import { createPinia } from "pinia";
import { MotionPlugin } from "@vueuse/motion";
import App from "./App.vue";
import { router } from "./router";
import { useSettingsStore } from "./stores/settings";
import "./styles/main.css";

const app = createApp(App);
app.use(createPinia());

const settings = useSettingsStore();
settings.applyToDocument();
void settings.syncAutoStartWithOS();

app.use(router);
app.use(MotionPlugin);

app.mount("#app");
