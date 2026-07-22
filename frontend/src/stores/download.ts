import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { api } from "@/api/client";
import { useLibraryStore } from "./library";
import { useSettingsStore } from "./settings";
import { useUIStore } from "./ui";

export interface DownloadItem {
  id: number;
  owner_id: number;
  title: string;
  artist: string;
  status: "pending" | "downloading" | "completed" | "failed";
  progress: number;
  error: string | null;
}

export const useDownloadStore = defineStore("download", () => {
  const queue = ref<DownloadItem[]>([]);
  const isExpanded = ref(false);
  const isPolling = ref(false);
  const showWidget = ref(false);
  let pollInterval: number | null = null;
  let hideTimeout: number | null = null;

  const activeCount = computed(() => {
    return queue.value.filter(item => item.status === "pending" || item.status === "downloading").length;
  });

  const totalCount = computed(() => queue.value.length);

  async function fetchQueue() {
    try {
      const data = await api.getLocalDownloadQueue();
      queue.value = data;
      
      if (activeCount.value === 0 && !isExpanded.value) {
        stopPolling();
      }
      
      // If any download completed, refresh local tracks map
      const hasCompleted = data.some(item => item.status === "completed");
      if (hasCompleted) {
        const library = useLibraryStore();
        void library.loadLocalTracks();
      }

      if (activeCount.value === 0 && queue.value.length > 0) {
        if (!hideTimeout) {
          hideTimeout = window.setTimeout(() => {
            if (activeCount.value === 0) {
              showWidget.value = false;
              isExpanded.value = false;
            }
          }, 3000); // Hide after 3 seconds
        }
      } else {
        if (hideTimeout) {
          window.clearTimeout(hideTimeout);
          hideTimeout = null;
        }
      }
    } catch (err) {
      console.error("Failed to fetch download queue:", err);
    }
  }

  function startPolling() {
    if (isPolling.value) return;
    isPolling.value = true;
    void fetchQueue();
    pollInterval = window.setInterval(fetchQueue, 1000);
  }

  function stopPolling() {
    if (!isPolling.value) return;
    isPolling.value = false;
    if (pollInterval) {
      window.clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  async function downloadTracks(tracks: any[]) {
    const settings = useSettingsStore();
    const ui = useUIStore();

    if (!settings.downloadPath) {
      if (window.vkmp?.selectFolder) {
        const folder = await window.vkmp.selectFolder();
        if (folder) {
          settings.downloadPath = folder;
          if (!settings.localFolders.includes(folder)) {
            settings.localFolders.push(folder);
          }
        } else {
          ui.notify("Скачивание отменено: не выбрана папка", "info");
          return;
        }
      }
    }

    showWidget.value = true;
    if (hideTimeout) {
      window.clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    try {
      await api.downloadTracks(tracks, settings.downloadPath || undefined);
      startPolling();
    } catch (err) {
      console.error("Failed to start download:", err);
    }
  }

  async function cancelDownload(trackId: number, ownerId: number) {
    try {
      // Optimistically remove from UI
      queue.value = queue.value.filter(t => !(t.id === trackId && t.owner_id === ownerId));
      await api.cancelLocalDownload(trackId, ownerId);
      void fetchQueue();
    } catch (err) {
      console.error("Failed to cancel download:", err);
    }
  }

  async function cancelAllDownloads() {
    try {
      // Optimistically remove pending items from UI
      queue.value = queue.value.filter(t => t.status !== 'pending');
      
      await api.cancelAllLocalDownloads();
      void fetchQueue();
    } catch (err) {
      console.error("Failed to cancel all downloads:", err);
    }
  }

  return {
    queue,
    isExpanded,
    isPolling,
    showWidget,
    activeCount,
    totalCount,
    fetchQueue,
    startPolling,
    stopPolling,
    downloadTracks,
    cancelDownload,
    cancelAllDownloads
  };
});
