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
import Spinner from "@/components/Spinner.vue";

const library = useLibraryStore();
const player = usePlayerStore();
const auth = useAuthStore();

const { feed, feedLoading } = storeToRefs(library);
const mixTracks = ref<Track[]>([]);
const mixLoading = ref(false);

onMounted(async () => {
  void library.loadFeed();
  mixLoading.value = true;
  try {
    const res = await api.recommendations({
      user_id: auth.status.user_id ?? undefined,
      count: 60,
    });
    // Shuffle so the same login doesn't always start with the same prefix.
    const arr = [...res.items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    mixTracks.value = arr;
  } finally {
    mixLoading.value = false;
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
  // Backend ships tracks inline when /feed falls back to
  // audio.getRecommendations, so we can launch the queue without an extra
  // round-trip. If we ever get a real catalog block (no inline tracks), we
  // fall back to the personal mix.
  const tracks = block.tracks?.length ? block.tracks : mixTracks.value;
  if (tracks.length) player.playQueue(tracks);
}

function playFeed() {
  if (mixTracks.value.length) {
    player.playQueue(mixTracks.value);
  }
}
</script>

<template>
  <ScrollArea>
    <PageHeader
      :eyebrow="greetings + ', ' + (auth.status.first_name ?? '')"
      title="Что послушаем сегодня?"
      subtitle="Алгоритмы ВК подбирают свежий микс под твой вкус и обновляют его автоматически."
    />

    <section class="home__hero">
      <button
        class="home__mix"
        :disabled="!mixTracks.length"
        @click="playFeed"
        :aria-label="mixTracks.length ? 'Включить VK Микс' : 'Микс загружается'"
      >
        <div class="home__mix-glow" />
        <div class="home__mix-body">
          <div class="home__mix-eyebrow">Персональная подборка</div>
          <div class="home__mix-title">Слушать VK Микс</div>
          <div class="home__mix-sub">
            <template v-if="mixLoading">
              <Spinner :size="14" /> Готовим микс…
            </template>
            <template v-else-if="mixTracks.length">
              Бесконечный поток под твой вкус
            </template>
            <template v-else>Нет свежих рекомендаций</template>
          </div>
        </div>
        <div class="home__mix-play">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </button>
    </section>

    <section class="home__feed">
      <div class="home__section-head">
        <h2>Рекомендации для тебя</h2>
      </div>
      <div v-if="feedLoading" class="home__loading">
        <Spinner :size="20" /> Загружаем рекомендации…
      </div>
      <div v-else-if="!feed || !feed.blocks.length" class="home__loading home__loading--soft">
        ВК не вернул карточки сегодня. Включи микс выше — в нём подборка под тебя.
      </div>
      <div v-else class="home__cards">
        <RecommendationCard
          v-for="(block, i) in feed.blocks.slice(0, 12)"
          :key="block.id"
          :block="block"
          :index="i"
          @open="openBlock"
        />
      </div>
    </section>
  </ScrollArea>
</template>

<style scoped>
.home__hero {
  padding: 0 32px 18px;
}
.home__mix {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 18px;
  text-align: left;
  padding: 28px 28px;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, var(--accent-1), var(--accent-2) 55%, var(--accent-3));
  color: var(--accent-text, #fff);
  overflow: hidden;
  box-shadow: var(--shadow-md);
  transition: transform var(--motion-duration-fast) var(--motion-ease-out);
}
.home__mix:hover:not(:disabled) {
  transform: translateY(-1px);
}
.home__mix:disabled {
  opacity: 0.75;
  cursor: progress;
}
.home__mix-glow {
  position: absolute;
  inset: -40% -10% auto auto;
  width: 60%;
  height: 200%;
  background: radial-gradient(closest-side, rgba(255, 255, 255, 0.35), transparent 70%);
  pointer-events: none;
}
.home__mix-body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
}
.home__mix-eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  opacity: 0.85;
}
.home__mix-title {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.1;
}
.home__mix-sub {
  font-size: 13px;
  opacity: 0.9;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.home__mix-play {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(8px);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: transform var(--motion-duration-fast) var(--motion-ease-out);
}
.home__mix:hover:not(:disabled) .home__mix-play {
  transform: scale(1.06);
}
.home__feed {
  padding: 12px 32px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.home__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 16px;
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
