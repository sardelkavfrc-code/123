<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
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
const router = useRouter();

const { feed, feedLoading } = storeToRefs(library);
const recommendedTracks = ref<Track[]>([]);
const recommendedLoading = ref(false);

onMounted(async () => {
  await Promise.all([library.loadFeed(), library.loadMyMusic()]);
  recommendedLoading.value = true;
  try {
    const res = await api.recommendations({
      user_id: auth.status.user_id ?? undefined,
      count: 40,
    });
    recommendedTracks.value = res.items;
  } finally {
    recommendedLoading.value = false;
  }
});

const greetings = computed(() => {
  const hour = new Date().getHours();
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
});

function openBlock(block: RecommendationBlock) {
  // For now we just play the recommendations stream — playlist drill-in is a
  // future iteration; opening a card kicks off a fresh recommendation queue.
  player.playQueue(recommendedTracks.value);
  router.push({ name: "library" });
  void block;
}

function playFeed() {
  if (recommendedTracks.value.length) {
    player.playQueue(recommendedTracks.value);
  }
}
</script>

<template>
  <ScrollArea>
    <PageHeader
      :eyebrow="greetings + ', ' + (auth.status.first_name ?? '')"
      title="Что послушаем сегодня?"
      subtitle="Собрано алгоритмами ВКонтакте — обновляется автоматически. Открывай карточки или включай микс целиком."
    >
      <template #actions>
        <button class="btn btn--primary" :disabled="!recommendedTracks.length" @click="playFeed">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Включить микс
        </button>
        <RouterLink :to="{ name: 'library' }" class="btn btn--ghost">Моя музыка →</RouterLink>
      </template>
    </PageHeader>

    <section class="home__feed">
      <div v-if="feedLoading" class="home__loading">
        <Spinner :size="20" /> Загружаем рекомендации…
      </div>
      <div v-else-if="!feed || !feed.blocks.length" class="home__loading home__loading--soft">
        ВК не вернул карточки сегодня. Попробуй обновиться позже или включить микс ниже.
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
        <h2>Рекомендации для тебя</h2>
        <button class="btn btn--ghost" :disabled="!recommendedTracks.length" @click="playFeed">
          Слушать всё
        </button>
      </div>
      <div v-if="recommendedLoading" class="home__loading"><Spinner :size="18" /> Грузим треки…</div>
      <TrackList
        v-else
        :tracks="recommendedTracks.slice(0, 20)"
        :show-index="true"
        empty-title="Рекомендаций пока нет"
        empty-subtitle="Послушай что-нибудь — VK подстроится"
      />
    </section>
  </ScrollArea>
</template>

<style scoped>
.home__feed {
  padding: 8px 32px 16px;
}
.home__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 16px;
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
