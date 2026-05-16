<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import { tracksLabel } from "@/composables/useFormat";

const library = useLibraryStore();
const player = usePlayerStore();

const { myMusic, myMusicLoading } = storeToRefs(library);
const query = ref("");

onMounted(() => {
  void library.loadMyMusic();
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return myMusic.value;
  return myMusic.value.filter(
    (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
});

function playAll() {
  if (filtered.value.length) player.playQueue(filtered.value);
}
function shufflePlay() {
  if (!filtered.value.length) return;
  const arr = [...filtered.value];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  player.playQueue(arr);
}
</script>

<template>
  <ScrollArea>
    <PageHeader
      eyebrow="Твоя коллекция"
      title="Моя музыка"
      :subtitle="myMusic.length ? tracksLabel(myMusic.length) : 'Загружаем твои треки…'"
    >
      <template #actions>
        <button class="btn btn--primary" :disabled="!filtered.length" @click="playAll">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Слушать
        </button>
        <button class="btn btn--ghost" :disabled="!filtered.length" @click="shufflePlay">
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
        <button class="btn btn--ghost" @click="library.loadMyMusic(true)">Обновить</button>
      </template>
    </PageHeader>

    <section class="my-music">
      <div v-if="myMusicLoading && !myMusic.length" class="my-music__loading">
        <Spinner :size="20" /> Грузим библиотеку…
      </div>
      <TrackList
        v-else
        :tracks="filtered"
        show-index
        empty-title="В библиотеке пусто"
        empty-subtitle="Сохрани треки из поиска или рекомендаций — они появятся здесь"
      />
    </section>
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
</style>
