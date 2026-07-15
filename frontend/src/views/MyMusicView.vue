<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
import { api, APIError } from "@/api/client";
import type { Track } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import UnavailableTracksModal from "@/components/UnavailableTracksModal.vue";
import { tracksLabel } from "@/composables/useFormat";

const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();

const { myMusic, myMusicLoading, myMusicLoadingMore, myMusicHasMore, myMusicTotal } =
  storeToRefs(library);
const query = ref("");

const activeTab = ref<"library" | "recent">("library");
const recentMusic = ref<Track[]>([]);
const recentMusicLoading = ref(false);
const recentMusicError = ref<string | null>(null);

const showUnavailableModal = ref(false);

onMounted(async () => {
  await library.loadMyMusic();
  void library.loadAllMyMusic();
});

async function loadRecent() {
  if (recentMusic.value.length > 0) return;
  recentMusicLoading.value = true;
  recentMusicError.value = null;
  try {
    const list = await api.recentTracks();
    recentMusic.value = list.items;
  } catch (err) {
    recentMusicError.value = err instanceof APIError ? err.message : (err as Error).message;
  } finally {
    recentMusicLoading.value = false;
  }
}

watch(activeTab, (tab) => {
  if (tab === "recent") {
    void loadRecent();
  }
});

const unavailableTracks = computed(() => myMusic.value.filter(t => !t.url));

const activeFullList = computed(() => {
  return activeTab.value === "recent" ? recentMusic.value : myMusic.value;
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  const list = activeFullList.value;
  if (!q) return list;
  return list.filter(
    (t: Track) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
});

const subtitle = computed(() => {
  if (activeTab.value === "recent") {
    if (recentMusicLoading.value) return "Загружаем недавние треки…";
    return tracksLabel(recentMusic.value.length);
  }
  if (!myMusic.value.length) return "Загружаем твои треки…";
  if (myMusicTotal.value && myMusicTotal.value > myMusic.value.length) {
    return `${tracksLabel(myMusic.value.length)} из ${myMusicTotal.value}`;
  }
  return tracksLabel(myMusic.value.length);
});

function onReachEnd() {
  if (activeTab.value !== "library") return;
  if (!myMusicHasMore.value || myMusicLoadingMore.value || myMusicLoading.value) return;
  void library.loadMoreMyMusic();
}

const isGlobalLoading = ref(false);

async function handlePlay(_track: Track, index: number) {
  if (query.value.trim().length > 0) {
    player.playQueue(filtered.value, index);
    return;
  }
  
  player.playQueue(activeFullList.value, index);
  
  if (activeTab.value === "library") {
    void (async () => {
      try {
        const all = await library.loadAllMyMusic();
        player.setQueue(all);
      } catch (err) {
        console.error("Failed to load all music in background", err);
      }
    })();
  }
}

async function playAll() {
  if (!filtered.value.length) return;
  if (query.value.trim().length > 0) {
    player.playQueue(filtered.value, 0);
    return;
  }
  
  player.playQueue(activeFullList.value, 0);
  
  if (activeTab.value === "library") {
    void (async () => {
      try {
        const all = await library.loadAllMyMusic();
        player.setQueue(all);
      } catch (err) {
        console.error("Failed to load all music in background", err);
      }
    })();
  }
}

async function shufflePlay() {
  if (!filtered.value.length) return;
  if (query.value.trim().length > 0) {
    player.shuffle = true;
    player.playQueue(filtered.value, -1);
    return;
  }
  
  player.shuffle = true;
  player.playQueue(activeFullList.value, -1);
  
  if (activeTab.value === "library") {
    void (async () => {
      try {
        const all = await library.loadAllMyMusic();
        player.setQueue(all);
      } catch (err) {
        console.error("Failed to load all music in background", err);
      }
    })();
  }
}

async function deleteTrack(track: Track) {
  try {
    await library.removeFromLibrary(track);
    ui.notify(`Трек удален: ${track.title}`, 'success');
  } catch (err: any) {
    ui.notify(`Ошибка удаления: ${err.message}`, 'error');
  }
}

async function replaceTrack(oldTrack: Track, newTrack: Track) {
  try {
    await library.addToLibrary(newTrack);
    await library.removeFromLibrary(oldTrack);
    ui.notify(`Трек заменен: ${oldTrack.title} -> ${newTrack.title}`, 'success');
  } catch (err: any) {
    ui.notify(`Ошибка замены трека: ${err.message}`, 'error');
  }
}

async function deleteAllTracks() {
  const tracks = unavailableTracks.value;
  let deleted = 0;
  for (const track of tracks) {
    try {
      await library.removeFromLibrary(track);
      deleted++;
    } catch (err: any) {
      console.error(err);
    }
  }
  if (deleted > 0) {
    ui.notify(`Удалено треков: ${deleted}`, 'success');
  }
  if (unavailableTracks.value.length === 0) {
    showUnavailableModal.value = false;
  }
}
</script>

<template>
  <ScrollArea @reach-end="onReachEnd">
    <PageHeader
      eyebrow="Твоя коллекция"
      title="Моя музыка"
      :subtitle="subtitle"
    >
      <template #actions>
        <button class="btn btn--primary" :disabled="!filtered.length || isGlobalLoading" @click="playAll">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          <span v-if="isGlobalLoading">Загрузка...</span>
          <span v-else>Слушать</span>
        </button>
        <button class="btn btn--ghost" :disabled="!filtered.length || isGlobalLoading" @click="shufflePlay">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" />
          </svg>
          Перемешать
        </button>
        <input
          v-model="query"
          class="input my-music__filter"
          placeholder="Поиск в библиотеке"
          aria-label="Поиск"
        />
        <button 
          v-if="unavailableTracks.length > 0"
          class="btn btn--unavailable"
          title="Показать недоступные треки"
          @click="showUnavailableModal = true"
        >
          <img src="/unavailable-icon.png" alt="error" />
        </button>
      </template>
    </PageHeader>

    <section class="my-music">
      <div class="my-music__tabs" role="tablist">
        <button
          class="my-music__tab"
          :class="{ 'my-music__tab--active': activeTab === 'library' }"
          @click="activeTab = 'library'"
          role="tab"
          :aria-selected="activeTab === 'library'"
        >
          Библиотека
        </button>
        <button
          class="my-music__tab"
          :class="{ 'my-music__tab--active': activeTab === 'recent' }"
          @click="activeTab = 'recent'"
          role="tab"
          :aria-selected="activeTab === 'recent'"
        >
          Недавние
        </button>
      </div>

      <template v-if="activeTab === 'library'">
        <div v-if="myMusicLoading && !myMusic.length" class="my-music__loading">
          <Spinner :size="20" /> Грузим библиотеку…
        </div>
        <template v-else>
          <TrackList
            :tracks="filtered"
            show-index
            manual-play
            empty-title="В библиотеке пусто"
            empty-subtitle="Сохрани треки из поиска или рекомендаций — они появятся здесь"
            @play="handlePlay"
          />
          <div v-if="myMusicLoadingMore" class="my-music__loading">
            <Spinner :size="16" /> Подгружаем ещё…
          </div>
        </template>
      </template>

      <template v-else>
        <div v-if="recentMusicLoading" class="my-music__loading">
          <Spinner :size="20" /> Загружаем недавние треки…
        </div>
        <div v-else-if="recentMusicError" class="my-music__error">
          {{ recentMusicError }}
        </div>
        <template v-else>
          <TrackList
            :tracks="filtered"
            show-index
            manual-play
            empty-title="Недавно воспроизведенных треков нет"
            empty-subtitle="Слушай музыку из поиска или рекомендаций, чтобы она появлялась здесь"
            @play="handlePlay"
          />
        </template>
      </template>
    </section>

    <UnavailableTracksModal
      :show="showUnavailableModal"
      :tracks="unavailableTracks"
      @close="showUnavailableModal = false"
      @delete="deleteTrack"
      @delete-all="deleteAllTracks"
      @replace="replaceTrack"
    />
  </ScrollArea>
</template>

<style scoped>
.my-music {
  padding: 0 32px 24px;
}
.my-music__tabs {
  display: inline-flex;
  padding: 4px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  gap: 2px;
  margin-bottom: 24px;
}
.my-music__tab {
  padding: 6px 18px;
  border-radius: 999px;
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 500;
  color: var(--text-2);
  cursor: pointer;
  background: transparent;
  border: none;
  transition:
    background var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
}
.my-music__tab:hover:not(.my-music__tab--active) {
  color: var(--text-0);
}
.my-music__tab--active {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: var(--accent-text, #fff);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
.my-music__filter {
  width: 280px;
  height: 38px;
}
.my-music__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  padding: 12px 0;
}
.my-music__error {
  color: var(--danger);
  padding: 12px 0;
  font-size: calc(13px * var(--font-scale, 1));
}
.btn--unavailable {
  padding: 4px;
  background: rgba(255, 71, 87, 0.1);
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 71, 87, 0.2);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn--unavailable:hover {
  background: rgba(255, 71, 87, 0.2);
  border-color: rgba(255, 71, 87, 0.4);
}
.btn--unavailable img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}
</style>
