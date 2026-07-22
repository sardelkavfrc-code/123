<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
import { api, APIError } from "@/api/client";
import type { Track, AlbumSummary } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import PlaylistRow from "@/components/PlaylistRow.vue";
import Spinner from "@/components/Spinner.vue";
import EmptyState from "@/components/EmptyState.vue";
import UnavailableTracksModal from "@/components/UnavailableTracksModal.vue";
import CreatePlaylistWizardModal from "@/components/CreatePlaylistWizardModal.vue";
import SvgIcon from "@/components/SvgIcon.vue";
import { tracksLabel } from "@/composables/useFormat";

const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();
const router = useRouter();

const showSettings = ref(false);
function goToDislikes() {
  showSettings.value = false;
  router.push("/library/dislikes");
}

const {
  myMusic,
  myMusicLoading,
  myMusicLoadingMore,
  myMusicHasMore,
  myMusicTotal,
  myPlaylists,
  myPlaylistsLoading,
  myPlaylistsError,
  activePlaylist,
  currentPlaylistTracks,
} = storeToRefs(library);

const activeTab = ref<"library" | "recent" | "playlists">("library");

import { useDownloadStore } from "@/stores/download";

const downloadStore = useDownloadStore();

const isSelectMode = ref(false);
const selectedTracks = ref<Set<string>>(new Set());
const selectedTracksList = ref<Track[]>([]);

function enterSelectMode() {
  showSettings.value = false;
  isSelectMode.value = true;
  selectedTracks.value = new Set();
  selectedTracksList.value = [];
}

function exitSelectMode() {
  isSelectMode.value = false;
  selectedTracks.value = new Set();
  selectedTracksList.value = [];
}

function toggleSelectTrack(track: Track) {
  const key = `${track.owner_id}_${track.id}`;
  const nextSet = new Set(selectedTracks.value);
  if (nextSet.has(key)) {
    nextSet.delete(key);
    selectedTracksList.value = selectedTracksList.value.filter(t => `${t.owner_id}_${t.id}` !== key);
  } else {
    nextSet.add(key);
    selectedTracksList.value.push(track);
  }
  selectedTracks.value = nextSet;
}

function toggleSelectAll() {
  const allSelected = filtered.value.every(t => selectedTracks.value.has(`${t.owner_id}_${t.id}`));
  if (allSelected) {
    selectedTracks.value = new Set();
    selectedTracksList.value = [];
  } else {
    const nextSet = new Set(selectedTracks.value);
    filtered.value.forEach(t => {
      const key = `${t.owner_id}_${t.id}`;
      if (!nextSet.has(key)) {
        nextSet.add(key);
        selectedTracksList.value.push(t);
      }
    });
    selectedTracks.value = nextSet;
  }
}

function downloadSelected() {
  if (selectedTracksList.value.length === 0) return;
  const indexMap = new Map();
  filtered.value.forEach((t, i) => indexMap.set(`${t.owner_id}_${t.id}`, i));
  const sortedSelection = [...selectedTracksList.value].sort((a, b) => {
    const idxA = indexMap.get(`${a.owner_id}_${a.id}`) ?? 999999;
    const idxB = indexMap.get(`${b.owner_id}_${b.id}`) ?? 999999;
    return idxA - idxB;
  });
  const withIndex = sortedSelection.map((t, idx) => ({ ...t, playlist_index: idx + 1 }));
  void downloadStore.downloadTracks(withIndex);
  ui.notify(`Начато скачивание ${selectedTracksList.value.length} треков`, "success");
  exitSelectMode();
}

function handleContextMenuSelected(e: MouseEvent) {
  if (selectedTracksList.value.length > 0) {
    ui.showTrackContextMenu(e, selectedTracksList.value, 'full');
  }
}

async function downloadPlaylist(playlist: AlbumSummary) {
  ui.notify("Загрузка списка треков плейлиста...", "info");
  try {
    const numericId = typeof playlist.id === "string" ? parseInt(playlist.id) : playlist.id;
    const res = await api.playlistTracks(playlist.owner_id || 0, numericId, { count: 200 });
    const tracks = res.items || [];
    if (tracks.length > 0) {
      const withIndex = tracks.map((t, idx) => ({ ...t, playlist_index: idx + 1 }));
      void downloadStore.downloadTracks(withIndex);
      ui.notify(`Начато скачивание плейлиста «${playlist.title}» (${tracks.length} треков)`, "success");
    } else {
      ui.notify("В плейлисте нет треков для скачивания", "error");
    }
  } catch (err) {
    ui.notify("Не удалось загрузить треки плейлиста", "error");
  }
}

function downloadPlaylistTracks(tracks: Track[]) {
  if (tracks.length === 0) return;
  const withIndex = tracks.map((t, idx) => ({ ...t, playlist_index: idx + 1 }));
  void downloadStore.downloadTracks(withIndex);
  ui.notify(`Начато скачивание плейлиста «${activePlaylist.value?.title}» (${tracks.length} треков)`, "success");
}

watch(activeTab, () => {
  exitSelectMode();
});

onBeforeUnmount(() => {
  exitSelectMode();
});
const recentMusic = ref<Track[]>([]);
const recentMusicLoading = ref(false);
const recentMusicLoadingMore = ref(false);
const recentMusicError = ref<string | null>(null);
const recentNextFrom = ref<string | null>(null);
const recentBlockId = ref<string | null>(null);

const tabLibrary = ref<HTMLElement | null>(null);
const tabRecent = ref<HTMLElement | null>(null);
const tabPlaylists = ref<HTMLElement | null>(null);
const indicatorStyle = ref({
  left: "0px",
  width: "0px",
});

function updateIndicator() {
  const activeEl =
    activeTab.value === "library"
      ? tabLibrary.value
      : activeTab.value === "recent"
        ? tabRecent.value
        : tabPlaylists.value;
  if (activeEl) {
    indicatorStyle.value = {
      left: `${activeEl.offsetLeft}px`,
      width: `${activeEl.clientWidth}px`,
    };
  }
}

const showUnavailableModal = ref(false);

onMounted(async () => {
  await library.loadMyMusic();
  // Скрытая фоновая загрузка всего списка для Shuffle и поиска
  void library.loadAllMyMusic();
  window.addEventListener("resize", updateIndicator);
  setTimeout(() => {
    updateIndicator();
  }, 100);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateIndicator);
});

async function loadRecent() {
  if (recentMusic.value.length > 0) return;
  recentMusicLoading.value = true;
  recentMusicError.value = null;
  try {
    const list = await api.recentTracks();
    recentMusic.value = list.items;
    recentNextFrom.value = list.next_from || null;
    recentBlockId.value = list.block_id || null;
  } catch (err) {
    recentMusicError.value = err instanceof APIError ? err.message : (err as Error).message;
  } finally {
    recentMusicLoading.value = false;
  }
}

watch(activeTab, (tab) => {
  if (tab === "recent") {
    void loadRecent();
  } else if (tab === "playlists") {
    void library.loadMyPlaylists();
  }
  library.activePlaylist = null;
  library.currentPlaylistTracks = [];
  nextTick(() => {
    updateIndicator();
  });
});

const unavailableTracks = computed(() => myMusic.value.filter(t => !t.url));

const activeFullList = computed(() => {
  return activeTab.value === "recent" ? recentMusic.value : myMusic.value;
});

const filtered = computed(() => {
  return activeFullList.value;
});

const playlistsLabel = (count: number) => {
  let label = "плейлистов";
  if (count % 10 === 1 && count % 100 !== 11) label = "плейлист";
  else if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) label = "плейлиста";
  return `${count} ${label}`;
};

const subtitle = computed(() => {
  if (activeTab.value === "playlists") {
    if (myPlaylistsLoading.value) return "Загружаем плейлисты…";
    return playlistsLabel(myPlaylists.value.length);
  }
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

async function onReachEnd() {
  if (activeTab.value === "library") {
    if (!myMusicHasMore.value || myMusicLoadingMore.value || myMusicLoading.value) return;
    void library.loadMoreMyMusic();
  } else if (activeTab.value === "recent") {
    if (!recentNextFrom.value || recentMusicLoadingMore.value || recentMusicLoading.value) return;
    recentMusicLoadingMore.value = true;
    try {
      const list = await api.catalogBlockItems({
        block_id: recentBlockId.value!,
        start_from: recentNextFrom.value,
      });
      const have = new Set(recentMusic.value.map((t) => `${t.owner_id}_${t.id}`));
      const fresh = list.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
      recentMusic.value = [...recentMusic.value, ...fresh];
      recentNextFrom.value = list.next_from || null;
    } catch (err) {
      console.error("Failed to load more recent tracks", err);
      recentNextFrom.value = null; // Clear cursor on error to prevent infinite retry loops
    } finally {
      recentMusicLoadingMore.value = false;
    }
  }
}

async function onRecentNearEnd() {
  if (!recentNextFrom.value || recentMusicLoadingMore.value) return;
  recentMusicLoadingMore.value = true;
  try {
    const list = await api.catalogBlockItems({
      block_id: recentBlockId.value!,
      start_from: recentNextFrom.value,
    });
    const have = new Set(recentMusic.value.map((t) => `${t.owner_id}_${t.id}`));
    const fresh = list.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
    recentMusic.value = [...recentMusic.value, ...fresh];
    recentNextFrom.value = list.next_from || null;
    
    const newPlayable = fresh.filter((t) => t.url);
    if (newPlayable.length > 0) {
      player.appendTracksToQueue(newPlayable);
    }
  } catch (err) {
    console.error("Failed to load more recent tracks in player callback", err);
  } finally {
    recentMusicLoadingMore.value = false;
  }
}

const isGlobalLoading = ref(false);

async function handlePlay(_track: Track, index: number) {

  
  const onNearEnd = activeTab.value === "recent" ? onRecentNearEnd : undefined;
  player.playQueue(activeFullList.value, index, { autoPlay: true }, onNearEnd);
  
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

  
  const onNearEnd = activeTab.value === "recent" ? onRecentNearEnd : undefined;
  player.playQueue(activeFullList.value, 0, { autoPlay: true }, onNearEnd);
  
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

  
  player.shuffle = true;
  const onNearEnd = activeTab.value === "recent" ? onRecentNearEnd : undefined;
  player.playQueue(activeFullList.value, -1, { autoPlay: true }, onNearEnd);
  
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


async function deletePlaylist(playlist: AlbumSummary) {
  try {
    await library.unfollowPlaylist(playlist);
    ui.notify(`Плейлист удален: ${playlist.title}`, "success");
  } catch (err: any) {
    ui.notify(`Ошибка удаления: ${err.message}`, "error");
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

const showCreateWizard = ref(false);

function triggerCreatePlaylist() {
  showSettings.value = false;
  showCreateWizard.value = true;
}

const playlistTracksLoading = ref(false);

async function openPlaylist(playlist: AlbumSummary) {
  library.activePlaylist = playlist;
  library.currentPlaylistTracks = [];
  playlistTracksLoading.value = true;
  try {
    const numericId = Number(playlist.id.split("_").pop() || playlist.id);
    const res = await api.playlistTracks(playlist.owner_id || 0, numericId, { count: 200 });
    library.currentPlaylistTracks = res.items || [];
  } catch (e) {
    ui.notify("Не удалось загрузить треки плейлиста", "error");
  } finally {
    playlistTracksLoading.value = false;
  }
}

function closePlaylist() {
  library.activePlaylist = null;
  library.currentPlaylistTracks = [];
}

function playPlaylistTrack(_track: Track, index: number) {
  player.playQueue(library.currentPlaylistTracks, index, { autoPlay: true }, undefined, library.activePlaylist!);
}

function playActivePlaylist() {
  if (!library.currentPlaylistTracks.length) return;
  player.playQueue(library.currentPlaylistTracks, 0, { autoPlay: true }, undefined, library.activePlaylist!);
}

function shareActivePlaylist() {
  if (!library.activePlaylist) return;
  ui.activeSharePlaylist = library.activePlaylist;
  ui.shareModalOpen = true;
}

const isRefreshing = ref(false);

async function refreshAll() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    if (activeTab.value === "library") {
      await library.loadMyMusic(true);
      ui.notify("Библиотека обновлена", "success");
    } else if (activeTab.value === "recent") {
      recentMusic.value = [];
      await loadRecent();
      ui.notify("Недавние треки обновлены", "success");
    } else if (activeTab.value === "playlists") {
      if (library.activePlaylist) {
        await openPlaylist(library.activePlaylist);
        ui.notify("Плейлист обновлен", "success");
      } else {
        await library.loadMyPlaylists(true);
        ui.notify("Список плейлистов обновлен", "success");
      }
    }
  } catch (err: any) {
    ui.notify(err.message || "Не удалось обновить", "error");
  } finally {
    isRefreshing.value = false;
  }
}
</script>

<template>
  <ScrollArea @reach-end="onReachEnd">
    <PageHeader
      title="Моя музыка"
      :subtitle="subtitle"
    >
      <template #actions>
        <template v-if="activeTab !== 'playlists'">
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
        </template>
        <button 
          class="btn btn--ghost my-music__search-btn" 
          @click="router.push('/search')"
          aria-label="Поиск"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          Поиск
        </button>
        <button 
          class="btn btn--ghost my-music__refresh-btn" 
          :class="{ 'my-music__refresh-btn--spin': isRefreshing }"
          :disabled="isRefreshing"
          @click="refreshAll"
          title="Обновить"
          aria-label="Обновить"
        >
          <SvgIcon name="refresh" width="16" height="16" />
        </button>
        <button 
          v-if="unavailableTracks.length > 0"
          class="btn btn--unavailable"
          title="Показать недоступные треки"
          @click="showUnavailableModal = true"
        >
          <img src="unavailable-icon.png" alt="error" />
        </button>
        <div class="my-music__settings-wrapper" @mouseleave="showSettings = false">
          <button class="btn btn--ghost my-music__settings-btn" @click="showSettings = !showSettings" aria-label="Настройки">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" /></svg>
          </button>
          <Transition name="dropdown-fade">
            <div v-if="showSettings" class="my-music__dropdown" @click.stop>
              <div class="my-music__dropdown-item" @click="triggerCreatePlaylist">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Создать плейлист
              </div>
              <div class="my-music__dropdown-item" @click="enterSelectMode">
                <SvgIcon name="download" width="16" height="16" />
                Скачать треки
              </div>
              <div class="my-music__dropdown-item" @click="goToDislikes">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
                </svg>
                Дизлайкнутые треки
              </div>
            </div>
          </Transition>
        </div>
      </template>
    </PageHeader>

    <section class="my-music">
      <div class="my-music__tabs" role="tablist">
        <button
          ref="tabLibrary"
          class="my-music__tab"
          :class="{ 'my-music__tab--active': activeTab === 'library' }"
          @click="activeTab = 'library'"
          role="tab"
          :aria-selected="activeTab === 'library'"
        >
          Библиотека
        </button>
        <button
          ref="tabRecent"
          class="my-music__tab"
          :class="{ 'my-music__tab--active': activeTab === 'recent' }"
          @click="activeTab = 'recent'"
          role="tab"
          :aria-selected="activeTab === 'recent'"
        >
          Недавние
        </button>
        <button
          ref="tabPlaylists"
          class="my-music__tab"
          :class="{ 'my-music__tab--active': activeTab === 'playlists' }"
          @click="activeTab = 'playlists'"
          role="tab"
          :aria-selected="activeTab === 'playlists'"
        >
          Плейлисты
        </button>
        <div class="my-music__tab-indicator" :style="indicatorStyle" />
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
            :is-select-mode="isSelectMode"
            :selected-tracks="selectedTracks"
            empty-title="В библиотеке пусто"
            empty-subtitle="Сохрани треки из поиска или рекомендаций — они появятся здесь"
            @play="handlePlay"
            @toggle-select="toggleSelectTrack"
            @context-menu-selected="handleContextMenuSelected"
          />
          <div v-if="myMusicLoadingMore" class="my-music__loading">
            <Spinner :size="16" /> Подгружаем ещё…
          </div>
        </template>
      </template>

      <template v-else-if="activeTab === 'recent'">
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
            :is-select-mode="isSelectMode"
            :selected-tracks="selectedTracks"
            empty-title="Недавно воспроизведенных треков нет"
            empty-subtitle="Слушай музыку из поиска или рекомендаций, чтобы она появлялась здесь"
            @play="handlePlay"
            @toggle-select="toggleSelectTrack"
          />
          <div v-if="recentMusicLoadingMore" class="my-music__loading">
            <Spinner :size="16" /> Подгружаем ещё…
          </div>
        </template>
      </template>

      <template v-else>
        <div v-if="activePlaylist" class="my-music__playlist-details">
          <div class="playlist-details__header">
            <button class="btn btn--ghost playlist-details__back-btn" @click="closePlaylist">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
              Назад к плейлистам
            </button>
            
            <div class="playlist-details__info-block">
              <div class="playlist-details__cover-wrap">
                <img v-if="activePlaylist.cover" :src="activePlaylist.cover" class="playlist-details__cover" alt="Cover" />
                <div v-else class="playlist-details__fallback accent-gradient"></div>
              </div>
              
              <div class="playlist-details__meta">
                <h2 class="playlist-details__title">{{ activePlaylist.title }}</h2>
                <div class="playlist-details__subtitle" v-if="activePlaylist.subtitle || activePlaylist.track_count">
                  {{ activePlaylist.subtitle || `${activePlaylist.track_count} треков` }}
                </div>
                
                <div class="playlist-details__actions">
                  <button class="btn btn--primary" :disabled="playlistTracksLoading || !currentPlaylistTracks.length" @click="playActivePlaylist">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    Слушать
                  </button>
                  <button class="btn btn--secondary" :disabled="playlistTracksLoading || !currentPlaylistTracks.length" @click="downloadPlaylistTracks(currentPlaylistTracks)">
                    <SvgIcon name="download" width="16" height="16" style="margin-right: 8px;" />
                    Скачать
                  </button>
                  <button class="btn btn--ghost" @click="shareActivePlaylist">
                    <SvgIcon name="share" width="16" height="16" style="margin-right: 8px;" />
                    Поделиться
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <div v-if="playlistTracksLoading" class="my-music__loading">
            <Spinner :size="20" /> Загружаем песни…
          </div>
          <TrackList
            v-else
            :tracks="currentPlaylistTracks"
            show-index
            manual-play
            empty-title="В плейлисте нет треков"
            empty-subtitle="Вы можете добавить треки в этот плейлист через контекстное меню любой песни"
            @play="playPlaylistTrack"
          />
        </div>
        
        <div v-else>
          <div v-if="myPlaylistsLoading" class="my-music__loading">
            <Spinner :size="20" /> Загружаем плейлисты…
          </div>
          <div v-else-if="myPlaylistsError" class="my-music__error">
            {{ myPlaylistsError }}
          </div>
          <template v-else>
            <div v-if="myPlaylists.length" class="my-music__playlists-list">
              <PlaylistRow
                v-for="pl in myPlaylists"
                :key="pl.id"
                :playlist="pl"
                @play="openPlaylist"
                @delete="deletePlaylist"
                @download="downloadPlaylist"
              />
            </div>
            <EmptyState
              v-else
              title="У вас нет сохраненных плейлистов"
              subtitle="Вы можете добавить их на главной странице или в поиске"
            />
          </template>
        </div>
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

    <CreatePlaylistWizardModal
      :show="showCreateWizard"
      @close="showCreateWizard = false"
    />

    <!-- Selection actions bar -->
    <Transition name="slide-up">
      <div v-if="isSelectMode" class="selection-bar">
        <div class="selection-bar__info">
          Выбрано треков: <span class="selection-bar__count">{{ selectedTracks.size }}</span>
        </div>
        <div class="selection-bar__actions">
          <button class="btn btn--secondary" @click="toggleSelectAll">
            {{ selectedTracks.size === filtered.length ? 'Снять всё' : 'Выбрать все' }}
          </button>
          <button class="btn btn--primary selection-bar__download-btn" :disabled="selectedTracks.size === 0" @click="downloadSelected">
            <SvgIcon name="download" width="16" height="16" style="margin-right: 6px;" />
            Скачать
          </button>
          <button class="btn btn--ghost" @click="exitSelectMode">
            Отмена
          </button>
        </div>
      </div>
    </Transition>
  </ScrollArea>
</template>

<style scoped>
.my-music {
  padding: 0 32px 24px;
}
.my-music__tabs {
  position: relative;
  display: flex;
  gap: 24px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
  margin-bottom: 24px;
}
.my-music__tab {
  position: relative;
  font-size: calc(15px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
  background: transparent;
  border: none;
  padding: 8px 4px;
  transition: color var(--motion-duration-fast) var(--motion-ease-out);
}
.my-music__tab:hover:not(.my-music__tab--active) {
  color: var(--text-0);
}
.my-music__tab--active {
  color: var(--text-0);
}
.my-music__tab-indicator {
  position: absolute;
  bottom: -1px;
  height: 2px;
  background: linear-gradient(90deg, var(--accent-1), var(--accent-3));
  border-radius: 99px;
  transition: left var(--motion-duration-slow) var(--motion-ease-out),
              width var(--motion-duration-slow) var(--motion-ease-out);
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

.my-music__settings-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.my-music__settings-btn {
  padding: 8px;
  min-width: 0;
  border-radius: 50%;
  color: var(--text-secondary);
}

.my-music__settings-btn:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.my-music__dropdown {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: auto;
  width: 240px;
  background: var(--bg-elev);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg, 12px);
  padding: 8px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  z-index: 101;
  transform-origin: top left;
}

.my-music__dropdown::before {
  content: "";
  position: absolute;
  top: -12px;
  left: 0;
  right: 0;
  height: 12px;
}

.my-music__dropdown-item {
  display: flex;
  align-items: center;
  gap: 8px; /* Уменьшил gap (было 12px) */
  padding: 8px 12px; /* Уменьшил отступы (было 10px 16px) */
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}

.my-music__dropdown-item:hover {
  background: var(--surface-hover);
  color: var(--primary);
}

.my-music__dropdown-item svg {
  color: var(--text-secondary);
  transition: color 0.2s;
}

.my-music__dropdown-item:hover svg {
  color: var(--primary);
}

.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-5px);
}
.my-music__playlists-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.my-music__playlists-header {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 16px;
  padding: 0 12px;
}

.playlist-modal-overlay {
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

.playlist-modal {
  width: 100%;
  max-width: 440px;
  background: var(--bg-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
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

.playlist-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-2);
}

.playlist-modal__header h3 {
  margin: 0;
  font-size: calc(18px * var(--font-scale, 1));
  font-weight: 700;
}

.playlist-modal__close {
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

.playlist-modal__close:hover {
  background: var(--bg-2);
  color: var(--text-0);
}

.playlist-modal__form {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.playlist-modal__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.playlist-modal__field label {
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--text-2);
}

.playlist-modal__field input,
.playlist-modal__field textarea {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-md, 8px);
  color: var(--text-0);
  padding: 10px 14px;
  font-size: calc(14px * var(--font-scale, 1));
  transition: border-color 0.2s, box-shadow 0.2s;
  outline: none;
}

.playlist-modal__field input:focus,
.playlist-modal__field textarea:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(var(--primary-rgb, 100, 100, 255), 0.2);
}

.playlist-modal__field textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.playlist-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

/* Playlist details page styles */
.my-music__playlist-details {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.playlist-details__header {
  display: flex;
  flex-direction: column;
  gap: 16px;
  border-bottom: 1px solid var(--border-weak, var(--border-2));
  padding-bottom: 20px;
}

.playlist-details__back-btn {
  align-self: flex-start;
  font-size: 13px;
  padding: 6px 12px;
}

.playlist-details__info-block {
  display: flex;
  gap: 24px;
  align-items: center;
}

.playlist-details__cover-wrap {
  width: 140px;
  height: 140px;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  flex-shrink: 0;
}

.playlist-details__cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlist-details__fallback {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
}

.playlist-details__meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.playlist-details__title {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-0);
  margin: 0;
  line-height: 1.2;
}

.playlist-details__subtitle {
  font-size: 14px;
  color: var(--text-2);
  font-weight: 500;
}

.playlist-details__actions {
  margin-top: 8px;
  display: flex;
  gap: 12px;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.my-music__refresh-btn--spin :deep(svg) {
  animation: spin 1s linear infinite;
}

.selection-bar {
  position: fixed;
  bottom: calc(var(--player-height, 80px) + 24px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 32px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  z-index: 1000;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.selection-bar__info {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-0);
}

.selection-bar__count {
  color: var(--accent-1);
  font-size: 16px;
  font-weight: 800;
}

.selection-bar__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity var(--motion-duration-slow) cubic-bezier(0.2, 0.8, 0.2, 1),
              transform var(--motion-duration-slow) cubic-bezier(0.2, 0.8, 0.2, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 24px);
}
</style>
