<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue";
import { useLibraryStore } from "@/stores/library";
import { useSettingsStore } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { usePlayerStore } from "@/stores/player";
import { api } from "@/api/client";
import type { Track } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import SvgIcon from "@/components/SvgIcon.vue";

const library = useLibraryStore();
const settings = useSettingsStore();
const ui = useUIStore();
const player = usePlayerStore();

const searchQuery = ref("");
const isScanning = ref(false);
const scanCount = ref(0);
let scanPollInterval: number | null = null;

const filteredTracks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return library.localTracks;
  return library.localTracks.filter(
    (t) =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      (t.album_title && t.album_title.toLowerCase().includes(q))
  );
});

async function addFolder() {
  if (!window.vkmp?.selectFolder) {
    ui.notify("Выбор папок доступен только в десктоп-версии", "error");
    return;
  }
  const folder = await window.vkmp.selectFolder();
  if (folder && !settings.localFolders.includes(folder)) {
    settings.localFolders.push(folder);
    ui.notify("Папка добавлена", "success");
    void startScan();
  }
}

function removeFolder(folder: string) {
  settings.localFolders = settings.localFolders.filter((f) => f !== folder);
  ui.notify("Папка удалена из списка", "info");
  void startScan();
}

async function startScan() {
  if (isScanning.value) return;
  isScanning.value = true;
  try {
    const foldersToScan = [...settings.localFolders];
    if (settings.downloadPath && !foldersToScan.includes(settings.downloadPath)) {
      foldersToScan.push(settings.downloadPath);
    }
    await api.scanLocalTracks(foldersToScan, settings.ignoredPaths);
    pollScanStatus();
  } catch (err) {
    isScanning.value = false;
    ui.notify("Ошибка при запуске сканирования", "error");
  }
}


async function checkScanStatus() {
  try {
    const res = await api.getLocalScanStatus();
    isScanning.value = res.is_scanning;
    scanCount.value = res.count;
    if (!res.is_scanning) {
      stopScanPolling();
      if (res.status === "completed") {
        ui.notify(`Сканирование завершено. Найдено треков: ${res.count}`, "success");
        void library.loadLocalTracks();
      } else if (res.status === "failed") {
        ui.notify(`Ошибка сканирования: ${res.error}`, "error");
      }
    }
  } catch (err) {
    stopScanPolling();
    isScanning.value = false;
  }
}

function pollScanStatus() {
  stopScanPolling();
  void checkScanStatus();
  scanPollInterval = window.setInterval(checkScanStatus, 1000);
}

function stopScanPolling() {
  if (scanPollInterval) {
    window.clearInterval(scanPollInterval);
    scanPollInterval = null;
  }
}

function handlePlay(_track: Track, index: number) {
  player.playQueue(filteredTracks.value, index);
}

const isSelectMode = ref(false);
const selectedTracks = ref<Set<string>>(new Set());

function toggleSelectMode() {
  isSelectMode.value = !isSelectMode.value;
  if (!isSelectMode.value) {
    selectedTracks.value.clear();
  }
}

function handleToggleSelect(track: Track) {
  const key = `${track.owner_id}_${track.id}`;
  const newSet = new Set(selectedTracks.value);
  if (newSet.has(key)) {
    newSet.delete(key);
  } else {
    newSet.add(key);
  }
  selectedTracks.value = newSet;
}

function selectAll() {
  const newSet = new Set<string>();
  filteredTracks.value.forEach((t) => {
    newSet.add(`${t.owner_id}_${t.id}`);
  });
  selectedTracks.value = newSet;
}

async function deleteSelected() {
  if (selectedTracks.value.size === 0) return;
  const isConfirmed = await ui.confirm(
    "Удаление треков",
    `Удалить выбранные треки (${selectedTracks.value.size} шт) из базы и с диска?`,
    "Удалить",
    "Отмена"
  );
  if (!isConfirmed) return;

  const tracksToDelete = filteredTracks.value.filter(t => selectedTracks.value.has(`${t.owner_id}_${t.id}`));
  
  try {
    for (const t of tracksToDelete) {
      await api.deleteLocalTrack(t.id, true);
      player.removeTrack(t);
    }
    await library.loadLocalTracks();
    ui.notify("Треки удалены", "success");
    isSelectMode.value = false;
    selectedTracks.value.clear();
  } catch (err: any) {
    ui.notify(err.message || "Не удалось удалить треки", "error");
  }
}

function enqueueSelected() {
  if (selectedTracks.value.size === 0) return;
  const tracksToQueue = filteredTracks.value.filter(t => selectedTracks.value.has(`${t.owner_id}_${t.id}`));
  tracksToQueue.forEach(t => player.enqueueNext(t));
  ui.notify(`В очередь добавлено треков: ${tracksToQueue.length}`, "success");
  isSelectMode.value = false;
  selectedTracks.value.clear();
}

function handleContextMenuSelected(e: MouseEvent) {
  const tracks = filteredTracks.value.filter(t => selectedTracks.value.has(`${t.owner_id}_${t.id}`));
  if (tracks.length > 0) {
    ui.showTrackContextMenu(e, tracks, 'full');
  }
}

onMounted(() => {
  void library.loadLocalTracks();
  void checkScanStatus();
});

onBeforeUnmount(() => {
  stopScanPolling();
});
</script>

<template>
  <ScrollArea class="device-view-container">
    <PageHeader title="Устройство" subtitle="Локальная музыка на вашем компьютере">
      <template #actions>
        <template v-if="isSelectMode">
          <button class="btn btn--secondary" @click="selectAll" title="Выбрать все">Все</button>
          <button class="btn btn--secondary btn--danger-hover" @click="deleteSelected" :disabled="selectedTracks.size === 0" title="Удалить выбранные">
            <SvgIcon name="cross" width="16" height="16" /> Удалить
          </button>
          <button class="btn btn--primary" @click="enqueueSelected" :disabled="selectedTracks.size === 0" title="В очередь">
            <SvgIcon name="queue_add" width="16" height="16" /> В очередь
          </button>
          <button class="btn btn--secondary" @click="toggleSelectMode" title="Отменить выбор">Отмена</button>
        </template>
        <template v-else>
          <button class="btn btn--secondary" @click="toggleSelectMode" title="Выбрать треки">
            <SvgIcon name="check" width="16" height="16" /> Выбрать
          </button>
          <button
            class="btn btn--secondary"
            :disabled="isScanning"
            @click="startScan"
            title="Обновить медиатеку"
          >
            <SvgIcon
              name="refresh"
              width="16"
              height="16"
              :class="{ 'btn-spin': isScanning }"
            />
            {{ isScanning ? 'Сканирование...' : 'Обновить' }}
          </button>
          <button class="btn btn--primary" @click="addFolder" title="Добавить папку">
            <SvgIcon name="plus" width="16" height="16" />
            Добавить папку
          </button>
        </template>
      </template>
    </PageHeader>

    <div class="device-content">
<!-- Scanned Folders Section -->
      <div class="folders-section">
        <div class="section-title">Папки для сканирования</div>
        <div v-if="settings.localFolders.length > 0" class="folders-grid">
          <div
            v-for="folder in settings.localFolders"
            :key="folder"
            class="folder-pill"
          >
            <span class="folder-pill__path" :title="folder">{{ folder }}</span>
            <button
              class="folder-pill__remove"
              @click="removeFolder(folder)"
              title="Удалить"
            >
              <SvgIcon name="cross" width="12" height="12" />
            </button>
          </div>
        </div>
        <div v-else class="folders-empty">
          Вы не добавили ни одной папки. Нажмите «Добавить папку», чтобы указать директорию с музыкой на диске. Все скачанные треки сохраняются в папку по умолчанию.
        </div>
      </div>

      <!-- Local search and tracks list -->
      <div class="tracks-section">
        <div class="tracks-header">
          <div class="section-title">
            Все треки
            <span v-if="library.localTracks.length" class="tracks-count">
              {{ library.localTracks.length }}
            </span>
          </div>

          <div v-if="library.localTracks.length" class="search-box">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Поиск по названию или исполнителю..."
              class="search-input"
            />
            <SvgIcon name="search" width="16" height="16" class="search-icon" />
            <button
              v-if="searchQuery"
              class="search-clear"
              @click="searchQuery = ''"
            >
              <SvgIcon name="cross" width="12" height="12" />
            </button>
          </div>
        </div>

        <div v-if="isScanning && !library.localTracks.length" class="scanning-loader">
          <Spinner :size="24" />
          <span>Сканируем файлы на жестком диске... Найдено: {{ scanCount }}</span>
        </div>

        <div v-else>
          <TrackList
            :tracks="filteredTracks"
            show-index
            manual-play
            :is-select-mode="isSelectMode"
            :selected-tracks="selectedTracks"
            empty-title="Локальных треков не найдено"
            empty-subtitle="Настройте папки выше и обновите медиатеку или просто скачивайте любимые треки из ВК!"
            @play="handlePlay"
            @toggle-select="handleToggleSelect"
            @context-menu-selected="handleContextMenuSelected"
          />
        </div>
      </div>
    </div>
  </ScrollArea>
</template>

<style scoped>
.device-view-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.device-content {
  padding: 0 32px 32px;
}

.folders-section {
  background: var(--bg-elev-glass);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid var(--border-weak);
  border-radius: var(--radius-lg);
  padding: 20px;
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.tracks-count {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  background: var(--bg-3);
  padding: 2px 8px;
  border-radius: 12px;
}

.folders-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.folder-pill {
  background: var(--bg-3);
  border: 1px solid var(--border-weak);
  border-radius: 100px;
  padding: 6px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 100%;
}

.folder-pill__path {
  font-size: 13px;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-pill__remove {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s, color 0.2s;
}

.folder-pill__remove:hover {
  background: rgba(255, 94, 126, 0.15);
  color: var(--danger);
}

.folders-empty {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.5;
}

.tracks-section {
  display: flex;
  flex-direction: column;
}

.tracks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 16px;
}

.search-box {
  position: relative;
  width: 320px;
  max-width: 100%;
}

.search-input {
  width: 100%;
  height: 38px;
  background: var(--bg-elev);
  border: 1px solid var(--border-weak);
  border-radius: var(--radius-md);
  padding: 0 36px 0 14px;
  font-size: 13px;
  color: var(--text-0);
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.search-input:focus {
  border-color: var(--accent-1);
  box-shadow: 0 0 0 2px rgba(62, 172, 255, 0.15);
}

.search-icon {
  position: absolute;
  top: 50%;
  right: 12px;
  transform: translateY(-50%);
  color: var(--text-2);
  pointer-events: none;
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 32px;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.search-clear:hover {
  color: var(--text-0);
}

.scanning-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 0;
  color: var(--text-2);
  font-size: 14px;
}

.btn-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
