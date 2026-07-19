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
import { useDislikesStore } from "@/stores/dislikes";
import { getMixBucket } from "@/composables/useMixCache";

const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();
const settings = useSettingsStore();
const dislikes = useDislikesStore();

const {
  homeCardsBrightness,
  homeCardsBrightnessAuto,
  homeCardsBrightnessDimmed,
  homeCardsBrightnessTimeStart,
  homeCardsBrightnessTimeEnd,
  mixMood,
  mixFamiliarity,
  mixLanguage,
} = storeToRefs(settings);

const showDropdown = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);
const showMixSettings = ref(false);
const mixSettingsRef = ref<HTMLElement | null>(null);

function toggleSettings(event: MouseEvent) {
  event.stopPropagation();
  showDropdown.value = !showDropdown.value;
  showMixSettings.value = false;
}

function toggleMixSettings(event: MouseEvent) {
  event.stopPropagation();
  showMixSettings.value = !showMixSettings.value;
  showDropdown.value = false;
}

function handleWindowClick(event: MouseEvent) {
  if (showDropdown.value && dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    showDropdown.value = false;
  }
  if (showMixSettings.value && mixSettingsRef.value && !mixSettingsRef.value.contains(event.target as Node)) {
    showMixSettings.value = false;
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

const closeMixSettings = () => {
  if (showMixSettings.value) {
    showMixSettings.value = false;
  }
};

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    checkAlgScroll();
    checkMoodsScroll();
  });
  window.addEventListener('click', closeMixSettings);
});
onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect();
  window.removeEventListener('click', closeMixSettings);
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

// VK Mix state. Buffers live per parameter-combo in useMixCache (module-scoped),
// so switching parameters never leaks tracks from another combo and re-selecting
// the same parameters serves instantly from memory.
const mixTracks = ref<Track[]>([]);
const mixLoading = ref(false);

onMounted(async () => {
  library.loadFromCache();
  library.loadAlgorithms(true);
  library.loadMoods(true);
  // Начинаем фоновую накачку кэша сразу при загрузке приложения
  ensureCacheBuffer().catch(console.error);
});

// Пре-нагрев буфера при смене параметров: буферы других комбинаций остаются
// в памяти, а для только что выбранной начинаем подкачку заранее.
watch([mixMood, mixFamiliarity, mixLanguage], () => {
  ensureCacheBuffer().catch(console.error);
});

let isCaching = false;
async function ensureCacheBuffer() {
  if (isCaching) return;
  isCaching = true;
  try {
    // Снимок параметров: наполняем буфер именно той комбинации, что выбрана сейчас.
    const mood = mixMood.value;
    const fam = mixFamiliarity.value;
    const lang = mixLanguage.value;
    const bucket = getMixBucket(mood, fam, lang);

    let attempts = 0;
    // Поддерживаем кэш на уровне 150 треков. Запросы делаем последовательно,
    // иначе ВК API отдаёт одинаковые массивы на параллельные запросы.
    while (bucket.buffer.length < 150 && attempts < 10) {
      // Пользователь переключил параметры на лету — прекращаем, чужой буфер не трогаем.
      if (mixMood.value !== mood || mixFamiliarity.value !== fam || mixLanguage.value !== lang) break;

      const res = await api.mix({ vibes: mood, recognitions: fam, langs: lang });
      if (!res.items || res.items.length === 0) break;

      let newTracks = 0;
      for (const t of res.items) {
        if (bucket.buffer.length >= 150) break;
        if (!bucket.seenIds.has(t.id)) {
          bucket.seenIds.add(t.id);
          if (!dislikes.isDisliked(t)) newTracks++;
          if (!dislikes.isDisliked(t)) bucket.buffer.push(t);
        }
      }
      
      // Если все треки дубликаты, прерываем цикл кэширования
      if (newTracks === 0) break;
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
    // 1. Быстрый старт: забираем первые 3 трека для моментального включения
    mixTracks.value = [];
    await fillMixBuffer(3);
    
    player.playQueue(
      mixTracks.value,
      0,
      { autoPlay: true },
      async () => {
        // Обычная подгрузка, когда доиграли почти до конца (осталось < 10 треков)
        await fillMixBuffer(50);
      }
    );

    // 2. Запускаем фоновую докачку остальных треков
    fillMixBuffer(47).catch(console.error);

  } finally {
    mixLoading.value = false; // UI кнопка отвисает моментально!
  }
}

// Функция подгрузки N уникальных треков для текущей комбинации параметров
async function fillMixBuffer(needTracks: number) {
  // Снимок параметров — работаем строго с буфером выбранной комбинации.
  const mood = mixMood.value;
  const fam = mixFamiliarity.value;
  const lang = mixLanguage.value;
  const bucket = getMixBucket(mood, fam, lang);

  let taken = 0;

  // 1. Мгновенно отдаём из буфера этой комбинации, если он не пуст (без запросов)
  if (bucket.buffer.length > 0) {
    const chunk: Track[] = [];
    while (bucket.buffer.length > 0 && chunk.length < needTracks) {
      const t = bucket.buffer.shift()!;
      if (!dislikes.isDisliked(t)) chunk.push(t); // дизлайкнутые в буфере пропускаем
    }
    if (chunk.length > 0) {
      mixTracks.value.push(...chunk);
      player.appendTracksToQueue(chunk);
      taken += chunk.length;
    }
  }

  // 2. Если буфера не хватило, идём в ВК (последовательно)
  let attempts = 0;
  while (taken < needTracks && attempts < 15) {
    const res = await api.mix({ vibes: mood, recognitions: fam, langs: lang });
    if (!res.items || res.items.length === 0) break;

    const chunk: Track[] = [];
    for (const t of res.items) {
      if (bucket.seenIds.has(t.id)) continue;
      bucket.seenIds.add(t.id);
      if (dislikes.isDisliked(t)) continue; // не подмешиваем «не нравится»
      if (taken + chunk.length < needTracks) {
        chunk.push(t);
      } else {
        bucket.buffer.push(t); // Сохраняем излишки на будущее
      }
    }
    
    // Если ВК отдал полностью дубликаты, нет смысла продолжать цикл, он отдаст их снова
    if (chunk.length === 0 && bucket.buffer.length === 0) {
      break;
    }

    // Сразу показываем пользователю новую порцию треков
    if (chunk.length > 0) {
      mixTracks.value.push(...chunk);
      player.appendTracksToQueue(chunk);
      taken += chunk.length;
    }

    attempts++;
  }

  // 3. Пингуем фоновую накачку, чтобы она восполнила потраченный буфер
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
      />
      <div class="home__actions" ref="dropdownRef">
        <button 
          class="btn btn--ghost home__search-btn" 
          @click="$router.push('/search')"
          aria-label="Поиск"
          style="margin-right: 8px;"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          Поиск
        </button>
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
      <div class="home__mix-container" @mouseleave="showMixSettings = false">
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
            
            <!-- Активные фильтры -->
            <div class="home__mix-filters" v-if="mixMood !== 'any' || mixFamiliarity !== 'any' || mixLanguage !== 'any'">
              <span class="home__mix-filter-badge" v-if="mixMood !== 'any'">
                {{ mixMood === 'happy' ? 'Радостно' : mixMood === 'sad' ? 'Грусть' : mixMood === 'active' ? 'Активно' : mixMood === 'calm' ? 'Спокойно' : 'Любовь' }}
              </span>
              <span class="home__mix-filter-badge" v-if="mixFamiliarity !== 'any'">
                {{ mixFamiliarity === 'known' ? 'Знакомое' : mixFamiliarity === 'unknown' ? 'Незнакомое' : 'Новинки' }}
              </span>
              <span class="home__mix-filter-badge" v-if="mixLanguage !== 'any'">
                {{ mixLanguage === 'ru' ? 'Русский' : mixLanguage === 'international' ? 'Иностранный' : 'Без слов' }}
              </span>
            </div>
          </div>
        </button>
        
        <div class="home__mix-settings-wrapper" ref="mixSettingsRef">
          <button class="home__mix-settings-inline-btn" :class="{ 'active': showMixSettings }" @click.stop="toggleMixSettings" aria-label="Настроить микс" title="Настройки микса">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="4" y1="8" x2="20" y2="8"></line>
              <line x1="4" y1="16" x2="20" y2="16"></line>
              <circle cx="10" cy="8" r="3" fill="currentColor"></circle>
              <circle cx="14" cy="16" r="3" fill="currentColor"></circle>
            </svg>
            Настроить
          </button>

          <Transition name="dropdown-fade">
            <div v-if="showMixSettings" class="home__mix-dropdown-floating" @click.stop>
              <div class="home__mix-dropdown-header">Настройки ВК Микса</div>
              
              <div class="home__mix-settings-row">
                <div class="home__mix-settings-label">Настроение</div>
                <div class="home__segmented">
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixMood === 'any'}" @click="mixMood = 'any'">Любое</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixMood === 'happy'}" @click="mixMood = 'happy'">Радостно</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixMood === 'sad'}" @click="mixMood = 'sad'">Грусть</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixMood === 'active'}" @click="mixMood = 'active'">Активно</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixMood === 'calm'}" @click="mixMood = 'calm'">Спокойно</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixMood === 'love'}" @click="mixMood = 'love'">Любовь</button>
                </div>
              </div>
              
              <div class="home__mix-settings-row">
                <div class="home__mix-settings-label">Узнаваемость</div>
                <div class="home__segmented">
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixFamiliarity === 'any'}" @click="mixFamiliarity = 'any'">Любое</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixFamiliarity === 'known'}" @click="mixFamiliarity = 'known'">Знакомое</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixFamiliarity === 'unknown'}" @click="mixFamiliarity = 'unknown'">Незнакомое</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixFamiliarity === 'fresh'}" @click="mixFamiliarity = 'fresh'">Новинки</button>
                </div>
              </div>

              <div class="home__mix-settings-row">
                <div class="home__mix-settings-label">Язык</div>
                <div class="home__segmented">
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixLanguage === 'any'}" @click="mixLanguage = 'any'">Любой</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixLanguage === 'ru'}" @click="mixLanguage = 'ru'">Русский</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixLanguage === 'international'}" @click="mixLanguage = 'international'">Иностранный</button>
                  <button class="home__segmented-btn" :class="{'home__segmented-btn--active': mixLanguage === 'instrumental'}" @click="mixLanguage = 'instrumental'">Без слов</button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
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
.home__mix-container {
  display: flex;
  gap: 12px;
  align-items: stretch;
  position: relative;
}
.home__mix {
  position: relative;
  flex: 1;
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
.home__mix-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.home__mix-filter-badge {
  font-size: calc(10px * var(--font-scale, 1));
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.home__mix-settings-wrapper {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  right: 24px;
  z-index: 20;
}
.home__mix-settings-inline-btn {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
  color: #fff;
  border-radius: 12px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: calc(14px * var(--font-scale, 1));
  font-weight: 600;
  cursor: pointer;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
  border: 1px solid rgba(255, 255, 255, 0.2);
}
.home__mix-settings-inline-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}
.home__mix-settings-inline-btn.active {
  background: rgba(255, 255, 255, 0.3);
}

.home__mix-dropdown-floating {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  background: var(--bg-elev);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg, 12px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  min-width: 280px;
  z-index: 100;
  cursor: default;
}
.home__mix-dropdown-header {
  font-size: calc(15px * var(--font-scale, 1));
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: -4px;
}
.home__mix-settings-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.home__mix-settings-label {
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--text-0);
  margin-left: 2px;
}
.home__segmented {
  display: inline-flex;
  background: var(--bg-3);
  border-radius: 8px;
  padding: 4px;
  gap: 4px;
  flex-wrap: wrap;
}
.home__segmented-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 14px;
  border-radius: 6px;
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 500;
  color: var(--text-2);
  cursor: pointer;
  background: transparent;
  border: none;
  transition: all var(--motion-duration-fast);
}
.home__segmented-btn:hover {
  color: var(--text-0);
}
.home__segmented-btn--active {
  background: var(--bg-1);
  color: var(--text-0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.home__dropdown-row--col {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.home__dropdown-select {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-0);
  padding: 8px 12px;
  font-family: inherit;
  font-size: calc(13px * var(--font-scale, 1));
  outline: none;
  cursor: pointer;
  transition: border-color var(--motion-duration-fast);
}
.home__dropdown-select:hover {
  border-color: var(--border-strong);
}
.home__dropdown-select:focus {
  border-color: var(--accent-1);
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
