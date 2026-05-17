import { defineStore } from "pinia";
import { ref } from "vue";

interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
}

export const useUIStore = defineStore("ui", () => {
  const toasts = ref<Toast[]>([]);
  let nextId = 1;

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

  return { toasts, notify, dismiss };
});
