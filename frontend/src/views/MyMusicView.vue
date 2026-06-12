<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
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

const showUnavailableModal = ref(false);

onMounted(() => {
  void library.loadMyMusic();
});

const unavailableTracks = computed(() => myMusic.value.filter(t => !t.url));

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return myMusic.value;
  return myMusic.value.filter(
    (t: Track) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
});

const subtitle = computed(() => {
  if (!myMusic.value.length) return "Загружаем твои треки…";
  if (myMusicTotal.value && myMusicTotal.value > myMusic.value.length) {
    return `${tracksLabel(myMusic.value.length)} из ${myMusicTotal.value}`;
  }
  return tracksLabel(myMusic.value.length);
});

function onReachEnd() {
  if (!myMusicHasMore.value || myMusicLoadingMore.value || myMusicLoading.value) return;
  // While the user is filtering, infinite scroll still hits the full list —
  // VK returns the unfiltered library and we filter client-side.
  void library.loadMoreMyMusic();
}

const isGlobalLoading = ref(false);

async function handlePlay(track: Track, index: number) {
  if (query.value.trim().length > 0) {
    player.playQueue(filtered.value, index);
    return;
  }
  isGlobalLoading.value = true;
  try {
    const all = await library.loadAllMyMusic();
    let fullIndex = all.findIndex((t) => t.id === track.id && t.owner_id === track.owner_id);
    if (fullIndex === -1) fullIndex = index;
    player.playQueue(all, fullIndex);
  } finally {
    isGlobalLoading.value = false;
  }
}

async function playAll() {
  if (!filtered.value.length) return;
  if (query.value.trim().length > 0) {
    player.playQueue(filtered.value, 0);
    return;
  }
  isGlobalLoading.value = true;
  try {
    const all = await library.loadAllMyMusic();
    player.playQueue(all, 0);
  } finally {
    isGlobalLoading.value = false;
  }
}

async function shufflePlay() {
  if (!filtered.value.length) return;
  if (query.value.trim().length > 0) {
    player.shuffle = true;
    player.playQueue(filtered.value, -1);
    return;
  }
  isGlobalLoading.value = true;
  try {
    const all = await library.loadAllMyMusic();
    player.shuffle = true;
    player.playQueue(all, -1);
  } finally {
    isGlobalLoading.value = false;
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
    </section>

    <UnavailableTracksModal
      :show="showUnavailableModal"
      :tracks="unavailableTracks"
      @close="showUnavailableModal = false"
      @delete="deleteTrack"
      @delete-all="deleteAllTracks"
    />
  </ScrollArea>
</template>

<style scoped>
.my-music {
  padding: 0 32px 24px;
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
