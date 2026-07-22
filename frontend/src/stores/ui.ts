import { defineStore } from "pinia";
import { ref } from "vue";
import { useStorage } from "@vueuse/core";

interface Toast {
  id: number;
  kind: "info" | "success" | "error";
  message: string;
  actionLabel?: string;
  action?: () => void;
  duration?: number;
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
  const activeContextMenuTrack = ref<any | any[]>(null); // Store the full track object(s)
  const activeContextMenuType = ref<'full' | 'edit_only'>('full');
  
  const addToPlaylistModalOpen = ref(false);
  const activePlaylistTrack = ref<any | null>(null);

  // Share modal state
  const shareModalOpen = ref(false);
  const activeShareTrack = ref<any | null>(null);
  const activeSharePlaylist = ref<any | null>(null);

  // Captcha State
  const captchaImg = ref<string | null>(null);
  const captchaSid = ref<string | null>(null);
  let captchaResolver: ((key: string | null) => void) | null = null;

  function requestCaptcha(sid: string, img: string): Promise<string | null> {
    captchaSid.value = sid;
    captchaImg.value = img;
    return new Promise((resolve) => {
      captchaResolver = resolve;
    });
  }

  function resolveCaptcha(key: string) {
    if (captchaResolver) {
      captchaResolver(key);
      captchaResolver = null;
    }
    captchaImg.value = null;
    captchaSid.value = null;
  }

  function cancelCaptcha() {
    if (captchaResolver) {
      captchaResolver(null);
      captchaResolver = null;
    }
    captchaImg.value = null;
    captchaSid.value = null;
  }

  // Confirm Modal State
  const confirmModalOpen = ref(false);
  const confirmModalTitle = ref("");
  const confirmModalMessage = ref("");
  const confirmModalConfirmText = ref("OK");
  const confirmModalCancelText = ref("Отмена");
  let confirmResolver: ((result: boolean) => void) | null = null;

  function confirm(
    title: string,
    message: string,
    confirmText = "OK",
    cancelText = "Отмена"
  ): Promise<boolean> {
    confirmModalTitle.value = title;
    confirmModalMessage.value = message;
    confirmModalConfirmText.value = confirmText;
    confirmModalCancelText.value = cancelText;
    confirmModalOpen.value = true;
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function resolveConfirm() {
    if (confirmResolver) {
      confirmResolver(true);
      confirmResolver = null;
    }
    confirmModalOpen.value = false;
  }

  function cancelConfirm() {
    if (confirmResolver) {
      confirmResolver(false);
      confirmResolver = null;
    }
    confirmModalOpen.value = false;
  }

  function showTrackContextMenu(event: MouseEvent, trackOrTracks: any | any[], menuType: 'full' | 'edit_only' = 'full') {
    activeContextMenuTrack.value = trackOrTracks;
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

  function notify(
    message: string, 
    kind: Toast["kind"] = "info", 
    duration = 3200,
    actionLabel?: string,
    action?: () => void
  ) {
    const id = nextId++;
    toasts.value.push({ id, message, kind, actionLabel, action, duration });
    window.setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, duration);
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
    showTrackContextMenu,
    addToPlaylistModalOpen,
    activePlaylistTrack,
    shareModalOpen,
    activeShareTrack,
    activeSharePlaylist,
    captchaImg,
    captchaSid,
    requestCaptcha,
    resolveCaptcha,
    cancelCaptcha,
    
    // Confirm Modal State
    confirmModalOpen,
    confirmModalTitle,
    confirmModalMessage,
    confirmModalConfirmText,
    confirmModalCancelText,
    confirm,
    resolveConfirm,
    cancelConfirm,
  };
});
