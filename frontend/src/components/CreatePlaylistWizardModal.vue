<script setup lang="ts">
import { ref, computed } from "vue";
import { useUIStore } from "@/stores/ui";
import { useLibraryStore } from "@/stores/library";
import Spinner from "@/components/Spinner.vue";

defineProps<{
  show: boolean;
}>();

const emit = defineEmits(["close"]);

const ui = useUIStore();
const library = useLibraryStore();

const playlistTitle = ref("");
const playlistDesc = ref("");
const trackSearchQuery = ref("");
const selectedTrackIds = ref(new Set<string>());
const creating = ref(false);

const filteredTracks = computed(() => {
  const query = trackSearchQuery.value.trim().toLowerCase();
  if (!query) return library.myMusicAll;
  return library.myMusicAll.filter(
    (t) =>
      t.title.toLowerCase().includes(query) ||
      t.artist.toLowerCase().includes(query)
  );
});

const isAllFilteredSelected = computed(() => {
  if (!filteredTracks.value.length) return false;
  return filteredTracks.value.every((t) =>
    selectedTrackIds.value.has(`${t.owner_id}_${t.id}`)
  );
});

function toggleTrack(track: any) {
  const key = `${track.owner_id}_${track.id}`;
  if (selectedTrackIds.value.has(key)) {
    selectedTrackIds.value.delete(key);
  } else {
    selectedTrackIds.value.add(key);
  }
}

function toggleSelectAllFiltered() {
  if (isAllFilteredSelected.value) {
    // Deselect all filtered
    filteredTracks.value.forEach((t) => {
      selectedTrackIds.value.delete(`${t.owner_id}_${t.id}`);
    });
  } else {
    // Select all filtered
    filteredTracks.value.forEach((t) => {
      selectedTrackIds.value.add(`${t.owner_id}_${t.id}`);
    });
  }
}

function handleClose() {
  playlistTitle.value = "";
  playlistDesc.value = "";
  trackSearchQuery.value = "";
  selectedTrackIds.value.clear();
  emit("close");
}

async function handleCreate() {
  if (!playlistTitle.value.trim() || creating.value) return;
  creating.value = true;
  try {
    // 1. Create playlist
    const newPlaylist = await library.createPlaylist(
      playlistTitle.value.trim(),
      playlistDesc.value.trim() || undefined
    );
    
    // 2. Add selected tracks if any
    if (selectedTrackIds.value.size > 0) {
      const selectedTracks = library.myMusicAll.filter((t) =>
        selectedTrackIds.value.has(`${t.owner_id}_${t.id}`)
      );
      await library.addTracksToPlaylist(newPlaylist, selectedTracks);
      ui.notify(
        `Плейлист «${newPlaylist.title}» создан, добавлено ${selectedTracks.length} треков`,
        "success"
      );
    } else {
      ui.notify(`Плейлист «${newPlaylist.title}» создан`, "success");
    }
    
    handleClose();
  } catch (err: any) {
    ui.notify(err.message || "Не удалось создать плейлист", "error");
  } finally {
    creating.value = false;
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="wizard-overlay" @click="handleClose">
      <div class="wizard-modal" @click.stop>
        <!-- HEADER -->
        <div class="wizard-header">
          <h3>Создание плейлиста</h3>
          <button class="wizard-close" @click="handleClose">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="wizard-content">
          <!-- FORM SECTION -->
          <div class="wizard-form-section">
            <div class="wizard-field">
              <label for="w-title">Название плейлиста</label>
              <input
                id="w-title"
                v-model="playlistTitle"
                type="text"
                placeholder="Введите название..."
                required
                autocomplete="off"
                maxlength="100"
              />
            </div>
            
            <div class="wizard-field">
              <label for="w-desc">Описание (необязательно)</label>
              <input
                id="w-desc"
                v-model="playlistDesc"
                type="text"
                placeholder="Добавьте описание..."
                autocomplete="off"
                maxlength="250"
              />
            </div>
          </div>

          <!-- TRACKS SECTION -->
          <div class="wizard-tracks-section">
            <div class="wizard-tracks-header">
              <label>Выберите песни для добавления</label>
              <div class="wizard-tracks-tools">
                <input
                  v-model="trackSearchQuery"
                  type="text"
                  class="wizard-track-search"
                  placeholder="Поиск по песням..."
                />
                <button
                  v-if="filteredTracks.length"
                  type="button"
                  class="wizard-select-all"
                  @click="toggleSelectAllFiltered"
                >
                  {{ isAllFilteredSelected ? "Снять все" : "Выбрать все" }}
                </button>
              </div>
            </div>

            <!-- TRACK LIST -->
            <div class="wizard-list-container">
              <div v-if="!library.myMusicAll.length" class="wizard-list-status">
                В вашей библиотеке нет треков
              </div>
              <div v-else-if="!filteredTracks.length" class="wizard-list-status">
                Ничего не найдено
              </div>
              <div v-else class="wizard-list">
                <div
                  v-for="t in filteredTracks"
                  :key="`${t.owner_id}_${t.id}`"
                  class="wizard-item"
                  @click="toggleTrack(t)"
                >
                  <!-- CHECKBOX -->
                  <div class="wizard-item-checkbox">
                    <input
                      type="checkbox"
                      :checked="selectedTrackIds.has(`${t.owner_id}_${t.id}`)"
                      @click.stop="toggleTrack(t)"
                    />
                  </div>

                  <!-- COVER -->
                  <div class="wizard-item-cover">
                    <div
                      v-if="t.cover_small"
                      class="wizard-item-img"
                      :style="{ backgroundImage: `url(${t.cover_small})` }"
                    ></div>
                    <div v-else class="wizard-item-fallback">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    </div>
                  </div>

                  <!-- INFO -->
                  <div class="wizard-item-info">
                    <div class="wizard-item-title">{{ t.title }}</div>
                    <div class="wizard-item-artist">{{ t.artist }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ACTIONS -->
        <div class="wizard-actions">
          <button type="button" class="btn btn--ghost" @click="handleClose">Отмена</button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="creating || !playlistTitle.trim()"
            @click="handleCreate"
          >
            <Spinner v-if="creating" :size="16" />
            <span v-else>
              Создать плейлист
              <span v-if="selectedTrackIds.size > 0"> ({{ selectedTrackIds.size }})</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.wizard-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.wizard-modal {
  width: 100%;
  max-width: 540px;
  background: var(--bg-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 75vh;
  animation: modalSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.wizard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-2);
  flex-shrink: 0;
}

.wizard-header h3 {
  margin: 0;
  font-size: calc(16px * var(--font-scale, 1));
  font-weight: 700;
  color: var(--text-0);
}

.wizard-close {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s, color 0.2s;
}

.wizard-close:hover {
  background: var(--bg-2);
  color: var(--text-0);
}

.wizard-content {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.wizard-form-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  flex-shrink: 0;
}

.wizard-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wizard-field label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.wizard-field input {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-md, 8px);
  color: var(--text-0);
  padding: 8px 12px;
  font-size: 13px;
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.wizard-field input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(var(--primary-rgb, 100, 100, 255), 0.2);
}

.wizard-tracks-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.wizard-tracks-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wizard-tracks-header label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.wizard-tracks-tools {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wizard-track-search {
  flex: 1;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-0);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.wizard-track-search:focus {
  border-color: var(--primary);
}

.wizard-select-all {
  background: transparent;
  border: none;
  color: var(--primary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background 0.2s;
}

.wizard-select-all:hover {
  background: var(--surface-hover);
}

.wizard-list-container {
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: var(--bg-3);
  overflow-y: auto;
  flex: 1;
  min-height: 180px;
}

.wizard-list-status {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
}

.wizard-list {
  display: flex;
  flex-direction: column;
  padding: 4px;
}

.wizard-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.wizard-item:hover {
  background: var(--bg-2);
}

.wizard-item-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.wizard-item-checkbox input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.wizard-item-cover {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-1);
}

.wizard-item-img {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}

.wizard-item-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  background: linear-gradient(135deg, var(--bg-2), var(--bg-1));
}

.wizard-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.wizard-item-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wizard-item-artist {
  font-size: 11px;
  color: var(--text-2);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wizard-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-2);
  background: var(--bg-1);
  flex-shrink: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
