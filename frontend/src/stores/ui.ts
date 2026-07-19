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

  const sidebarSettingsOpen = ref(false);
  const trackSettingsOpen = ref(false);
  const trackContextMenuOpen = ref(false);
  const trackContextMenuPos = ref({ x: 0, y: 0 });
  const hoveredTrackKey = ref<string | null>(null);
  const activeContextMenuTrack = ref<any>(null); // Store the full track object instead of just key
  const activeContextMenuType = ref<'full' | 'edit_only'>('full');

  function showTrackContextMenu(event: MouseEvent, track: any, menuType: 'full' | 'edit_only' = 'full') {
    activeContextMenuTrack.value = track;
    activeContextMenuType.value = menuType;
    if (trackContextMenuOpen.value) {
      trackContextMenuOpen.value = false;
      window.setTimeout(() => {
        trackContextMenuPos.value = { x: event.clientX, y: event.clientY };
        trackContextMenuOpen.value = true;
      }, 0);
    } else {
      trackContextMenuPos.value = { x: event.clientX, y: event.clientY };
      trackContextMenuOpen.value = true;
    }
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

  return { 
    toasts, 
    notify, 
    dismiss, 
    sidebarCollapsed, 
    toggleSidebar, 
    sidebarSettingsOpen,
    trackSettingsOpen,
    trackContextMenuOpen,
    trackContextMenuPos,
    hoveredTrackKey,
    activeContextMenuTrack,
    activeContextMenuType,
    showTrackContextMenu
  };
});
