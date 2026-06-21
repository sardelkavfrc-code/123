import { defineStore } from "pinia";
import { ref } from "vue";
import { useStorage } from "@vueuse/core";

interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
}

export const useUIStore = defineStore("ui", () => {
  const toasts = ref<Toast[]>([]);
  let nextId = 1;

  let forceCollapse = false;
  try {
    const rawSettings = localStorage.getItem("vkmp:settings");
    if (rawSettings) {
      forceCollapse = JSON.parse(rawSettings).startSidebarCollapsed === true;
    }
  } catch (err) {
    console.error("Failed to parse settings for sidebar state", err);
  }
  
  const sidebarCollapsed = useStorage("vkmp_sidebar_collapsed", forceCollapse);
  if (forceCollapse) {
    sidebarCollapsed.value = true;
  }

  function notify(message: string, kind: Toast["kind"] = "info") {
    const id = nextId++;
    toasts.value.push({ id, message, kind });
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 3200);
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  return { toasts, notify, dismiss, sidebarCollapsed, toggleSidebar };
});
