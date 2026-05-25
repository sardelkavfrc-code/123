<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useAuthStore } from "@/stores/auth";
import { api } from "@/api/client";
import type { RecommendationBlock, Track } from "@/api/types";
import RecommendationCard from "@/components/RecommendationCard.vue";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";

const library = useLibraryStore();
const player = usePlayerStore();
const auth = useAuthStore();

const { feed, feedLoading, moods, moodsLoading } = storeToRefs(library);
const activeBlock = ref<RecommendationBlock | null>(null);
const blockTracks = ref<Track[]>([]);
const blockLoading = ref(false);

onMounted(async () => {
  await Promise.all([library.loadFeed(), library.loadMoods(), library.loadMyMusic()]);
});

const greetings = computed(() => {
  const hour = new Date().getHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
});

async function openBlock(block: RecommendationBlock) {
  if (block.owner_id === null || block.playlist_id === null) return;
  activeBlock.value = block;
  blockTracks.value = [];
  blockLoading.value = true;
  try {
    const res = await api.playlist({
      owner_id: block.owner_id,
      playlist_id: Number(block.playlist_id),
      access_key: block.access_key,
      count: 100,
    });
    blockTracks.value = res.items;
    if (res.items.length) player.playQueue(res.items);
  } finally {
    blockLoading.value = false;
  }
}

function playLoadedBlock() {
  if (blockTracks.value.length) {
    player.playQueue(blockTracks.value);
  }
}
</script>

<template>
  <ScrollArea>
    <PageHeader
      :eyebrow="greetings + ', ' + (auth.status.first_name ?? '')"
      title="Что послушаем сегодня?"
      subtitle="Ежедневные подборки ВКонтакте. Треки загрузятся только при открытии карточки."
    >
      <template #actions>
        <button class="btn btn--primary" :disabled="!blockTracks.length" @click="playLoadedBlock">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Слушать открытое
        </button>
        <RouterLink :to="{ name: 'library' }" class="btn btn--ghost">Моя музыка →</RouterLink>
      </template>
    </PageHeader>

    <section class="home__feed">
      <div v-if="feedLoading" class="home__loading">
        <Spinner :size="20" /> Загружаем рекомендации…
      </div>
      <div v-else-if="!feed || !feed.blocks.length" class="home__loading home__loading--soft">
        ВК не вернул карточки сегодня. Попробуй обновиться позже.
      </div>
      <div v-else class="home__cards">
        <RecommendationCard
          v-for="(block, i) in feed.blocks.slice(0, 10)"
          :key="block.id"
          :block="block"
          :index="i"
          @open="openBlock"
        />
      </div>
    </section>

    <section class="home__section">
      <div class="home__section-head">
        <h2>Настроения и занятия</h2>
      </div>
      <div v-if="moodsLoading" class="home__loading"><Spinner :size="18" /> Загружаем карточки…</div>
      <div v-else-if="!moods || !moods.blocks.length" class="home__loading home__loading--soft">
        ВК не вернул настроения сегодня.
      </div>
      <div v-else class="home__moods">
        <RecommendationCard
          v-for="(block, i) in moods.blocks"
          :key="block.id"
          :block="block"
          :index="i"
          variant="wide"
          @open="openBlock"
        />
      </div>
    </section>

    <section v-if="activeBlock || blockLoading" class="home__section">
      <div class="home__section-head">
        <h2>{{ activeBlock?.title ?? "Подборка" }}</h2>
        <button class="btn btn--ghost" :disabled="!blockTracks.length" @click="playLoadedBlock">
          Слушать всё
        </button>
      </div>
      <div v-if="blockLoading" class="home__loading"><Spinner :size="18" /> Грузим треки…</div>
      <TrackList
        v-else
        :tracks="blockTracks"
        :show-index="true"
        empty-title="В подборке пока нет треков"
        empty-subtitle="VK мог обновлять её прямо сейчас"
      />
    </section>
  </ScrollArea>
</template>

<style scoped>
.home__feed {
  padding: 8px 32px 16px;
}
.home__cards {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}
.home__cards > * {
  flex: 0 0 196px;
}
.home__moods {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}
.home__moods > * {
  flex: 0 0 198px;
}
.home__section {
  padding: 16px 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.home__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.home__section-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.home__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  font-size: 13px;
  padding: 12px 0;
}
.home__loading--soft {
  color: var(--text-3);
  font-style: italic;
}
</style>
