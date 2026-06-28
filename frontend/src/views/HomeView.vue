<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { api } from "@/api/client";
import type { AlbumSummary, Track } from "@/api/types";
import { useSettingsStore } from "@/stores/settings";
import { storeToRefs } from "pinia";

import RecommendationCard from "@/components/RecommendationCard.vue";
import MoodCard from "@/components/MoodCard.vue";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import Spinner from "@/components/Spinner.vue";

import { useUIStore } from "@/stores/ui";

const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();
const settings = useSettingsStore();

const {
  homeCardsBrightness,
  homeCardsBrightnessAuto,
  homeCardsBrightnessDimmed,
  homeCardsBrightnessTimeStart,
  homeCardsBrightnessTimeEnd,
} = storeToRefs(settings);

const dropdownRef = ref<HTMLElement | null>(null);
const showDropdown = ref(false);

function toggleSettings(event: MouseEvent) {
  event.stopPropagation();
  showDropdown.value = !showDropdown.value;
}

function handleWindowClick(event: MouseEvent) {
  if (showDropdown.value && dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    showDropdown.value = false;
  }
}

onMounted(() => {
  window.addEventListener("click", handleWindowClick);
});

onUnmounted(() => {
  window.removeEventListener("click", handleWindowClick);
});

const algorithmsScroll = ref<HTMLElement | null>(null);
const moodsScroll = ref<HTMLElement | null>(null);
const algAtStart = ref(true);
const algAtEnd = ref(false);
const moodsAtStart = ref(true);
const moodsAtEnd = ref(false);

function checkAlgScroll() {
  if (!algorithmsScroll.value) return;
  const el = algorithmsScroll.value;
  algAtStart.value = el.scrollLeft <= 0;
  algAtEnd.value = Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth - 1;
}

function checkMoodsScroll() {
  if (!moodsScroll.value) return;
  const el = moodsScroll.value;
  moodsAtStart.value = el.scrollLeft <= 0;
  moodsAtEnd.value = Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth - 1;
}

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    checkAlgScroll();
    checkMoodsScroll();
  });
});
onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
});

watch(algorithmsScroll, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) {
    resizeObserver?.observe(el);
    checkAlgScroll();
  }
});
watch(moodsScroll, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) {
    resizeObserver?.observe(el);
    checkMoodsScroll();
  }
});
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
      { autoPlay: true },
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
    <div class="home__header-container">
      <PageHeader
        title="Что послушаем сегодня?"
        subtitle="Алгоритмы ВК подбирают свежий микс под твой вкус и обновляют его автоматически."
      />
      <div class="home__actions" ref="dropdownRef">
        <button class="home__settings-btn" :class="{ 'home__settings-btn--active': showDropdown }" @click="toggleSettings" aria-label="Настройки яркости">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
          </svg>
        </button>
        
        <Transition name="dropdown-fade">
          <div v-if="showDropdown" class="home__dropdown">
            <div class="home__dropdown-title">Яркость карточек</div>
            
            <div class="home__dropdown-row">
              <div class="home__dropdown-label">
                <span class="home__dropdown-label-main">Постоянная</span>
                <span class="home__dropdown-label-sub">Яркость обложек на Главной</span>
              </div>
              <div class="home__dropdown-range">
                <input v-model.number="homeCardsBrightness" type="range" min="10" max="100" step="1" />
                <span class="home__dropdown-range-val">{{ homeCardsBrightness }}%</span>
              </div>
            </div>
            
            <div class="home__dropdown-row">
              <div class="home__dropdown-label">
                <span class="home__dropdown-label-main">По таймеру</span>
                <span class="home__dropdown-label-sub">Приглушать в ночное время</span>
              </div>
              <input v-model="homeCardsBrightnessAuto" type="checkbox" class="settings__switch" />
            </div>

            <Transition name="slide-up">
              <div v-if="homeCardsBrightnessAuto" class="home__dropdown-sub-section">
                <div class="home__dropdown-row">
                  <div class="home__dropdown-label">
                    <span class="home__dropdown-label-main">Яркость ночью</span>
                  </div>
                  <div class="home__dropdown-range">
                    <input v-model.number="homeCardsBrightnessDimmed" type="range" min="10" max="100" step="1" />
                    <span class="home__dropdown-range-val">{{ homeCardsBrightnessDimmed }}%</span>
                  </div>
                </div>

                <div class="home__dropdown-row home__dropdown-row--times">
                  <div class="home__dropdown-label">
                    <span class="home__dropdown-label-main">Интервал времени</span>
                  </div>
                  <div class="home__dropdown-time-inputs">
                    <input v-model="homeCardsBrightnessTimeStart" type="time" class="home__dropdown-time-input" />
                    <span class="home__dropdown-time-sep">&mdash;</span>
                    <input v-model="homeCardsBrightnessTimeEnd" type="time" class="home__dropdown-time-input" />
                  </div>
                </div>
              </div>
            </Transition>
          </div>
        </Transition>
      </div>
    </div>

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
            <button :class="{ 'home__slider-btn--hidden': algAtStart }" class="home__slider-btn home__slider-btn--prev" @click="scrollAlgorithms(-1)" aria-label="Листать влево">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div class="home__algorithms" ref="algorithmsScroll" @scroll="checkAlgScroll">
              <RecommendationCard
                v-for="(block, index) in library.algorithms.items.slice(0, 12)"
                :key="block.id"
                :block="block"
                :index="index"
                :loading="loadingAlbumId === block.id"
                @open="playAlbum"
              />
            </div>
            <button :class="{ 'home__slider-btn--hidden': algAtEnd }" class="home__slider-btn home__slider-btn--next" @click="scrollAlgorithms(1)" aria-label="Листать вправо">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </section>

        <section class="home__section" v-if="library.moods?.items && library.moods.items.length">
          <div class="home__section-head">
            <h2>Настроения и занятия</h2>
          </div>
          <div class="home__slider-container">
            <button :class="{ 'home__slider-btn--hidden': moodsAtStart }" class="home__slider-btn home__slider-btn--prev" @click="scrollMoods(-1)" aria-label="Листать влево">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div class="home__moods" ref="moodsScroll" @scroll="checkMoodsScroll">
              <MoodCard v-for="mood in library.moods.items" :key="mood.id" :mood="mood" :loading="loadingAlbumId === mood.id" @click="playAlbum(mood)" />
            </div>
            <button :class="{ 'home__slider-btn--hidden': moodsAtEnd }" class="home__slider-btn home__slider-btn--next" @click="scrollMoods(1)" aria-label="Листать вправо">
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
  box-shadow: var(--app-shadow, var(--shadow-md));
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
  font-size: calc(11px * var(--font-scale, 1));
  text-transform: uppercase;
  letter-spacing: calc(0.12em + var(--letter-spacing, 0px));
  opacity: 0.85;
}
.home__mix-title {
  font-size: calc(28px * var(--font-scale, 1));
  font-weight: 800;
  line-height: 1.1;
}
.home__mix-sub {
  font-size: calc(13px * var(--font-scale, 1));
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
  font-size: calc(18px * var(--font-scale, 1));
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
.home__slider-container:hover .home__slider-btn:not(.home__slider-btn--hidden) {
  opacity: 1;
}
.home__slider-btn:hover:not(.home__slider-btn--hidden) {
  background: var(--bg-3);
  transform: translateY(-50%) scale(1.1);
}
.home__slider-btn--hidden {
  opacity: 0 !important;
  pointer-events: none;
  transform: translateY(-50%) scale(0.8) !important;
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
  font-size: calc(13px * var(--font-scale, 1));
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
  font-size: calc(14px * var(--font-scale, 1));
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

/* Card brightness control styles */
.home__mix,
:deep(.rec-card),
:deep(.mood-card) {
  filter: brightness(var(--home-cards-brightness, 1));
  transition: transform var(--motion-duration-fast) var(--motion-ease-out), filter 0.5s ease-out;
}

.home__header-container {
  position: relative;
  width: 100%;
}
.home__actions {
  position: absolute;
  top: 28px;
  right: 32px;
  z-index: 100;
}
.home__settings-btn {
  background: var(--bg-3);
  border: 1px solid var(--border);
  color: var(--text-1);
  width: 38px;
  height: 38px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.home__settings-btn:hover {
  background: var(--bg-2);
  color: var(--text-0);
  border-color: var(--border-strong);
  transform: rotate(30deg);
}
.home__settings-btn--active {
  background: var(--accent-1);
  color: #fff;
  border-color: var(--accent-2);
  transform: rotate(90deg) !important;
}

.home__dropdown {
  position: absolute;
  top: 46px;
  right: 0;
  width: 290px;
  background: var(--bg-elev);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg, 12px);
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 14px;
  z-index: 101;
  transform-origin: top right;
}
.home__dropdown-title {
  font-size: calc(14px * var(--font-scale, 1));
  font-weight: 700;
  color: var(--text-0);
  border-bottom: 1px solid var(--divider);
  padding-bottom: 8px;
  margin-bottom: 2px;
}
.home__dropdown-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.home__dropdown-row--times {
  align-items: flex-start;
  flex-direction: column;
  gap: 6px;
}
.home__dropdown-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}
.home__dropdown-label-main {
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--text-0);
}
.home__dropdown-label-sub {
  font-size: calc(11px * var(--font-scale, 1));
  color: var(--text-2);
  line-height: 1.3;
}
.home__dropdown-range {
  display: flex;
  align-items: center;
  gap: 8px;
}
.home__dropdown-range input[type="range"] {
  width: 90px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-strong);
  height: 4px;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.home__dropdown-range input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--accent-1);
  cursor: pointer;
}
.home__dropdown-range-val {
  font-size: calc(11px * var(--font-scale, 1));
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
  min-width: 32px;
  text-align: right;
}
.home__dropdown-time-inputs {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}
.home__dropdown-time-input {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-0);
  padding: 4px 6px;
  font-family: inherit;
  font-size: calc(12px * var(--font-scale, 1));
  width: 48%;
  outline: none;
  text-align: center;
}
.home__dropdown-time-input:focus {
  border-color: var(--accent-1);
}
.home__dropdown-time-sep {
  color: var(--text-2);
  font-size: 10px;
}
.home__dropdown-sub-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--divider);
  padding-top: 12px;
  margin-top: 2px;
}

/* Switch styling in dropdown */
.home__dropdown .settings__switch {
  -webkit-appearance: none;
  appearance: none;
  width: 38px;
  height: 20px;
  border-radius: 999px;
  background: var(--bg-3);
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--motion-duration-fast) var(--motion-ease-out),
              box-shadow var(--motion-duration-fast) var(--motion-ease-out);
  overflow: hidden;
}
.home__dropdown .settings__switch::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  opacity: 0;
  transition: opacity 0.3s ease;
}
.home__dropdown .settings__switch:checked::before {
  opacity: 1;
}
.home__dropdown .settings__switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}
.home__dropdown .settings__switch:checked::after {
  transform: translateX(18px);
}

/* Dropdown Animations */
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.dropdown-fade-enter-from,
.dropdown-fade-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-5px);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
