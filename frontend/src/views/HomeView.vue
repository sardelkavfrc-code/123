<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { api } from "@/api/client";
import type { AlbumSummary, Track } from "@/api/types";

import RecommendationCard from "@/components/RecommendationCard.vue";
import MoodCard from "@/components/MoodCard.vue";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import Spinner from "@/components/Spinner.vue";

import { useUIStore } from "@/stores/ui";

const router = useRouter();
const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();

const moodsScroll = ref<HTMLElement | null>(null);
const loadingAlbumId = ref<string | null>(null);

// VK Mix state
let mixTrackCache: Track[] = [];
const mixTracks = ref<Track[]>([]);
const mixLoading = ref(false);

onMounted(async () => {
  library.loadFromCache();
  library.loadAlgorithms(true);
  library.loadMoods(true);
  // Начинаем фоновую накачку кэша сразу при загрузке приложения
  ensureCacheBuffer().catch(console.error);
});

let isCaching = false;
async function ensureCacheBuffer() {
  if (isCaching) return;
  isCaching = true;
  try {
    const knownIds = new Set([
      ...mixTracks.value.map(t => t.id),
      ...mixTrackCache.map(t => t.id)
    ]);
    
    let attempts = 0;
    // Поддерживаем кэш на уровне 150 треков. Запросы делаем последовательно,
    // иначе ВК API отдаёт одинаковые массивы на параллельные запросы.
    while (mixTrackCache.length < 150 && attempts < 10) {
      const res = await api.recommendations({ shuffle: true, count: 100 });
      if (!res.items || res.items.length === 0) break;
      
      for (const t of res.items) {
        if (mixTrackCache.length >= 150) break;
        if (!knownIds.has(t.id)) {
          knownIds.add(t.id);
          mixTrackCache.push(t);
        }
      }
      attempts++;
    }
  } finally {
    isCaching = false;
  }
}

function scrollMoods(direction: number) {
  const el = document.querySelector('.home__moods') as HTMLElement;
  if (el) {
    el.scrollLeft += direction * 600;
  }
}

function scrollAlgorithms(direction: number) {
  const el = document.querySelector('.home__algorithms') as HTMLElement;
  if (el) {
    el.scrollLeft += direction * 600;
  }
}

async function playMix() {
  if (mixLoading.value) return;
  mixLoading.value = true;
  try {
    // 1. Быстрый старт: забираем 50 треков прямиком из предзагруженного кэша в памяти
    mixTracks.value = [];
    await fillMixBuffer(50);
    
    player.playQueue(
      mixTracks.value,
      0,
      async () => {
        // Обычная подгрузка, когда доиграли почти до конца (осталось < 10 треков)
        await fillMixBuffer(50);
      }
    );

  } finally {
    mixLoading.value = false; // UI кнопка отвисает моментально!
  }
}

// Функция фоновой подгрузки N уникальных треков
async function fillMixBuffer(needTracks: number) {
  let newTracks: Track[] = [];
  let attempts = 0;
  const knownIds = new Set(mixTracks.value.map(t => t.id));

  // 1. Выгребаем треки из кэша, если они там есть
  while (mixTrackCache.length > 0 && newTracks.length < needTracks) {
    const t = mixTrackCache.shift();
    if (t && !knownIds.has(t.id)) {
      knownIds.add(t.id);
      newTracks.push(t);
    }
  }

  // 2. Если кэша не хватило, идем в ВК (последовательно)
  while (newTracks.length < needTracks && attempts < 15) {
    const res = await api.recommendations({ shuffle: true, count: 100 });
    if (!res.items || res.items.length === 0) break;
    
    for (const t of res.items) {
      if (!knownIds.has(t.id)) {
        knownIds.add(t.id);
        if (newTracks.length < needTracks) {
          newTracks.push(t);
        } else {
          mixTrackCache.push(t); // Сохраняем излишки на будущее
        }
      }
    }
    attempts++;
  }

  if (newTracks.length > 0) {
    mixTracks.value.push(...newTracks);
    player.appendTracksToQueue(newTracks);
  }

  // 3. Пингуем фоновую накачку, чтобы она восполнила потраченный кэш
  ensureCacheBuffer().catch(console.error);
}

async function playAlbum(album: AlbumSummary) {
  if (album.owner_id == null) return;
  try {
    const res = await api.playlistTracks(album.owner_id, parseInt(album.id), { count: 200 });
    if (res.items && res.items.length > 0) {
      player.playQueue(res.items, 0);
    } else {
      ui.notify("Плейлист пуст", "error");
    }
  } catch (e) {
    ui.notify("Не удалось загрузить треки", "error");
  }
}
</script>

<template>
  <ScrollArea>
    <PageHeader
      title="Что послушаем сегодня?"
      subtitle="Алгоритмы ВК подбирают свежий микс под твой вкус и обновляют его автоматически."
    />

    <section class="home__hero">
      <button class="home__mix" :disabled="mixLoading" @click="playMix" :aria-label="mixTracks.length ? 'Включить VK Микс' : 'Микс загружается'">
        <div class="home__mix-glow" />
        <div class="home__mix-body">
          <div class="home__mix-eyebrow">Персональная подборка</div>
          <div class="home__mix-title">Слушать VK Микс</div>
          <div class="home__mix-sub">
            <template v-if="mixLoading">
              <Spinner :size="14" /> Готовим микс…
            </template>
            <template v-else>
              Бесконечный поток под твой вкус
            </template>
          </div>
        </div>
        <div class="home__mix-play">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </div>
      </button>
    </section>

    <div v-if="library.albumsLoading || !library.algorithms" class="home__global-loading">
      <Spinner :size="24" /> Загружаем подборки…
    </div>

    <Transition name="content-reveal">
      <div v-if="!library.albumsLoading && library.algorithms" class="home__content-sections">
        <section class="home__feed">
          <div class="home__section-head">
            <h2>Рекомендации для тебя</h2>
          </div>
          <div v-if="library.algorithms && !library.algorithms.items?.length" class="home__loading home__loading--soft">
            ВК не вернул карточки алгоритмов сегодня.
          </div>
          <div v-else-if="library.algorithms" class="home__slider-container">
            <button class="home__slider-btn home__slider-btn--prev" @click="scrollAlgorithms(-1)" aria-label="Листать влево">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div class="home__algorithms">
              <RecommendationCard
                v-for="(block, index) in library.algorithms.items.slice(0, 12)"
                :key="block.id"
                :block="block"
                :index="index"
                :loading="loadingAlbumId === block.id"
                @open="playAlbum"
              />
            </div>
            <button class="home__slider-btn home__slider-btn--next" @click="scrollAlgorithms(1)" aria-label="Листать вправо">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </section>

        <section class="home__section" v-if="library.moods?.items && library.moods.items.length">
          <div class="home__section-head">
            <h2>Настроения и занятия</h2>
          </div>
          <div class="home__slider-container">
            <button class="home__slider-btn home__slider-btn--prev" @click="scrollMoods(-1)" aria-label="Листать влево">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div class="home__moods" ref="moodsScroll">
              <MoodCard v-for="mood in library.moods.items" :key="mood.id" :mood="mood" :loading="loadingAlbumId === mood.id" @click="playAlbum(mood)" />
            </div>
            <button class="home__slider-btn home__slider-btn--next" @click="scrollMoods(1)" aria-label="Листать вправо">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </section>
      </div>
    </Transition>
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
.home__algorithms {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 4px;
  scroll-behavior: smooth;
}
.home__algorithms::-webkit-scrollbar {
  display: none;
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
.home__section {
  padding: 12px 32px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.home__slider-container {
  position: relative;
  margin: 0 -32px;
  padding: 0 32px;
}
.home__slider-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--bg-2);
  color: var(--text-0);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  opacity: 0;
  transition: opacity 0.2s, background 0.2s, transform 0.2s;
  z-index: 10;
  border: 1px solid var(--border);
}
.home__slider-container:hover .home__slider-btn {
  opacity: 1;
}
.home__slider-btn:hover {
  background: var(--bg-3);
  transform: translateY(-50%) scale(1.1);
}
.home__slider-btn--prev {
  left: 16px;
}
.home__slider-btn--next {
  right: 16px;
}
.home__moods {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 4px;
  scroll-behavior: smooth;
}
.home__moods::-webkit-scrollbar {
  display: none;
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
.home__global-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 60px 0;
  color: var(--text-2);
  font-size: 14px;
}
.home__content-sections {
  display: contents;
}

/* Premium Reveal Animation */
.content-reveal-enter-active {
  transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.7s cubic-bezier(0.16, 1, 0.3, 1),
              filter 0.7s cubic-bezier(0.16, 1, 0.3, 1);
}
.content-reveal-leave-active {
  transition: opacity 0.3s ease-in, transform 0.3s ease-in;
}
.content-reveal-enter-from {
  opacity: 0;
  transform: translateY(30px) scale(0.96);
  filter: blur(8px);
}
.content-reveal-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.99);
}
</style>
