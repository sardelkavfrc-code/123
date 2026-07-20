<script setup lang="ts">
import { ref, computed } from "vue";
import { useUIStore } from "@/stores/ui";
import { useLibraryStore } from "@/stores/library";
import Spinner from "@/components/Spinner.vue";

const ui = useUIStore();
const library = useLibraryStore();

const searchPlaylistQuery = ref("");
const showCreateForm = ref(false);

const newPlaylistTitle = ref("");
const newPlaylistDesc = ref("");
const creatingPlaylist = ref(false);
const addingTrack = ref(false);

const track = computed(() => ui.activePlaylistTrack);

const filteredPlaylists = computed(() => {
  const query = searchPlaylistQuery.value.trim().toLowerCase();
  if (!query) return library.myPlaylists;
  return library.myPlaylists.filter((p) => p.title.toLowerCase().includes(query));
});

function handleClose() {
  ui.addToPlaylistModalOpen = false;
  ui.activePlaylistTrack = null;
  searchPlaylistQuery.value = "";
  showCreateForm.value = false;
  newPlaylistTitle.value = "";
  newPlaylistDesc.value = "";
}

async function selectPlaylist(playlist: any) {
  if (!track.value || addingTrack.value) return;
  addingTrack.value = true;
  try {
    await library.addTrackToPlaylist(playlist, track.value);
    ui.notify(`Трек успешно добавлен в плейлист «${playlist.title}»`, "success");
    handleClose();
  } catch (err: any) {
    ui.notify(err.message || "Не удалось добавить трек в плейлист", "error");
  } finally {
    addingTrack.value = false;
  }
}

async function handleCreateAndAdd() {
  if (!newPlaylistTitle.value.trim() || !track.value || creatingPlaylist.value) return;
  creatingPlaylist.value = true;
  try {
    // 1. Create playlist
    const newPlaylist = await library.createPlaylist(
      newPlaylistTitle.value.trim(),
      newPlaylistDesc.value.trim() || undefined
    );
    // 2. Add track to it
    await library.addTrackToPlaylist(newPlaylist, track.value);
    ui.notify(`Создан плейлист «${newPlaylist.title}», трек добавлен`, "success");
    handleClose();
  } catch (err: any) {
    ui.notify(err.message || "Не удалось создать плейлист", "error");
  } finally {
    creatingPlaylist.value = false;
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="ui.addToPlaylistModalOpen && track" class="add-to-pl-overlay" @click="handleClose">
      <div class="add-to-pl-modal" @click.stop>
        <!-- HEADER -->
        <div class="add-to-pl-modal__header">
          <h3>{{ showCreateForm ? "Создание плейлиста" : "Добавить в плейлист" }}</h3>
          <button class="add-to-pl-modal__close" @click="handleClose">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- TRACK SUMMARY -->
        <div class="add-to-pl-modal__track-summary">
          <div class="add-to-pl-modal__track-info">
            <span class="add-to-pl-modal__track-title">{{ track.title }}</span>
            <span class="add-to-pl-modal__track-artist">{{ track.artist }}</span>
          </div>
        </div>

        <!-- CREATE PLAYLIST FORM VIEW -->
        <div v-if="showCreateForm" class="add-to-pl-modal__form-container">
          <form @submit.prevent="handleCreateAndAdd" class="add-to-pl-modal__form">
            <div class="add-to-pl-modal__field">
              <label for="modal-pl-name">Название плейлиста</label>
              <input
                id="modal-pl-name"
                v-model="newPlaylistTitle"
                type="text"
                placeholder="Введите название..."
                required
                autocomplete="off"
                maxlength="100"
              />
            </div>
            
            <div class="add-to-pl-modal__field">
              <label for="modal-pl-desc">Описание (необязательно)</label>
              <textarea
                id="modal-pl-desc"
                v-model="newPlaylistDesc"
                placeholder="Добавьте описание..."
                rows="3"
                maxlength="250"
              />
            </div>
            
            <div class="add-to-pl-modal__actions">
              <button type="button" class="btn btn--ghost" @click="showCreateForm = false">Назад</button>
              <button type="submit" class="btn btn--primary" :disabled="creatingPlaylist || !newPlaylistTitle.trim()">
                <Spinner v-if="creatingPlaylist" :size="16" />
                <span v-else>Создать и добавить</span>
              </button>
            </div>
          </form>
        </div>

        <!-- PLAYLIST SELECTOR VIEW -->
        <div v-else class="add-to-pl-modal__selector">
          <!-- SEARCH & CREATE ACTION ROW -->
          <div class="add-to-pl-modal__top-actions">
            <input
              v-model="searchPlaylistQuery"
              type="text"
              class="add-to-pl-modal__search"
              placeholder="Поиск плейлиста..."
            />
            <button class="add-to-pl-modal__create-btn" @click="showCreateForm = true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Создать плейлист
            </button>
          </div>

          <!-- PLAYLISTS LIST -->
          <div class="add-to-pl-modal__list-container">
            <div v-if="library.myPlaylistsLoading" class="add-to-pl-modal__status">
              <Spinner :size="20" /> Загружаем плейлисты...
            </div>
            <div v-else-if="library.myPlaylistsError" class="add-to-pl-modal__status error">
              {{ library.myPlaylistsError }}
            </div>
            <div v-else-if="!library.myPlaylists.length" class="add-to-pl-modal__status empty">
              У вас нет плейлистов. Создайте первый плейлист!
            </div>
            <div v-else-if="!filteredPlaylists.length" class="add-to-pl-modal__status empty">
              Ничего не найдено
            </div>
            <div v-else class="add-to-pl-modal__list">
              <div
                v-for="p in filteredPlaylists"
                :key="p.id"
                class="add-to-pl-modal__item"
                @click="selectPlaylist(p)"
                :class="{ 'add-to-pl-modal__item--disabled': addingTrack }"
              >
                <!-- COVER ART -->
                <div class="add-to-pl-modal__item-cover">
                  <div
                    v-if="p.cover"
                    class="add-to-pl-modal__item-img"
                    :style="{ backgroundImage: `url(${p.cover})` }"
                  ></div>
                  <div v-else class="add-to-pl-modal__item-fallback">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                </div>
                
                <!-- TITLE & SUBTITLE -->
                <div class="add-to-pl-modal__item-info">
                  <div class="add-to-pl-modal__item-title">{{ p.title }}</div>
                  <div class="add-to-pl-modal__item-subtitle">
                    {{ p.track_count ? `${p.track_count} треков` : '0 треков' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.add-to-pl-overlay {
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

.add-to-pl-modal {
  width: 100%;
  max-width: 460px;
  background: var(--bg-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
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

.add-to-pl-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-2);
  flex-shrink: 0;
}

.add-to-pl-modal__header h3 {
  margin: 0;
  font-size: calc(18px * var(--font-scale, 1));
  font-weight: 700;
  color: var(--text-0);
}

.add-to-pl-modal__close {
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

.add-to-pl-modal__close:hover {
  background: var(--bg-2);
  color: var(--text-0);
}

.add-to-pl-modal__track-summary {
  background: var(--bg-2);
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-2);
  flex-shrink: 0;
}

.add-to-pl-modal__track-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.add-to-pl-modal__track-title {
  font-weight: 700;
  font-size: 14px;
  color: var(--text-0);
}

.add-to-pl-modal__track-artist {
  font-size: 12px;
  color: var(--text-2);
  font-weight: 500;
}

.add-to-pl-modal__form-container {
  padding: 20px;
  overflow-y: auto;
}

.add-to-pl-modal__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.add-to-pl-modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.add-to-pl-modal__field label {
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--text-2);
}

.add-to-pl-modal__field input,
.add-to-pl-modal__field textarea {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-md, 8px);
  color: var(--text-0);
  padding: 10px 14px;
  font-size: calc(14px * var(--font-scale, 1));
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.add-to-pl-modal__field input:focus,
.add-to-pl-modal__field textarea:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(var(--primary-rgb, 100, 100, 255), 0.2);
}

.add-to-pl-modal__field textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.add-to-pl-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.add-to-pl-modal__selector {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.add-to-pl-modal__top-actions {
  display: flex;
  gap: 12px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border-2);
  flex-shrink: 0;
}

.add-to-pl-modal__search {
  flex: 1;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-0);
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.add-to-pl-modal__search:focus {
  border-color: var(--primary);
}

.add-to-pl-modal__create-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-2);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  color: var(--text-0);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.add-to-pl-modal__create-btn:hover {
  background: var(--bg-3);
  border-color: var(--border-1);
}

.add-to-pl-modal__list-container {
  overflow-y: auto;
  flex: 1;
}

.add-to-pl-modal__status {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-2);
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.add-to-pl-modal__status.error {
  color: var(--danger, #ff4d4f);
}

.add-to-pl-modal__list {
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.add-to-pl-modal__item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.add-to-pl-modal__item:hover {
  background: var(--bg-2);
}

.add-to-pl-modal__item--disabled {
  pointer-events: none;
  opacity: 0.5;
}

.add-to-pl-modal__item-cover {
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: var(--bg-3);
}

.add-to-pl-modal__item-img {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
}

.add-to-pl-modal__item-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  background: linear-gradient(135deg, var(--bg-3), var(--bg-2));
}

.add-to-pl-modal__item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.add-to-pl-modal__item-title {
  font-weight: 700;
  font-size: 14px;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.add-to-pl-modal__item-subtitle {
  font-size: 12px;
  color: var(--text-2);
  font-weight: 500;
  margin-top: 2px;
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
