<script setup lang="ts">
import { computed, onMounted, ref, watch, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, APIError } from "@/api/client";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
import type { Artist, Track, AlbumSummary } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import ArtistCard from "@/components/ArtistCard.vue";
import RecommendationCard from "@/components/RecommendationCard.vue";
import EmptyState from "@/components/EmptyState.vue";
import Spinner from "@/components/Spinner.vue";
import SliderTrackRow from "@/components/SliderTrackRow.vue";
const PAGE_SIZE = 30;

const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();
const router = useRouter();
const route = useRoute();

const query = ref(typeof route.query.q === "string" ? route.query.q : "");
const debounceMs = 350;

const results = ref<Track[]>([]);
const total = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);

const searchArtists = ref<Artist[]>([]);
const searchPlaylists = ref<AlbumSummary[]>([]);

const hasMore = computed(() => total.value > 0 && results.value.length < total.value);

let debounceHandle: number | null = null;
let runToken = 0;

const searchHistory = ref<string[]>([]);

function loadHistory() {
  try {
    const saved = localStorage.getItem("vkplayer_search_history");
    if (saved) searchHistory.value = JSON.parse(saved);
  } catch (e) {
    // ignore
  }
}

function saveHistory() {
  localStorage.setItem("vkplayer_search_history", JSON.stringify(searchHistory.value));
}

function removeFromHistory(h: string) {
  searchHistory.value = searchHistory.value.filter(x => x !== h);
  saveHistory();
}

function clearHistory() {
  searchHistory.value = [];
  localStorage.removeItem("vkplayer_search_history");
}

onMounted(() => {
  loadHistory();
  void library.loadMyMusic();
  if (query.value.trim()) void runGlobal();

  resizeObserver = new ResizeObserver(() => {
    checkArtistsScroll();
    checkPlaylistsScroll();
    checkLibraryScroll();
    checkVkTracksScroll();
  });
  if (artistsScroll.value) {
    resizeObserver.observe(artistsScroll.value);
  }
  if (playlistsScroll.value) {
    resizeObserver.observe(playlistsScroll.value);
  }
  if (libraryScroll.value) {
    resizeObserver.observe(libraryScroll.value);
  }
  if (vkTracksScroll.value) {
    resizeObserver.observe(vkTracksScroll.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

const libraryMatches = ref<Track[]>([]);

const artistsScroll = ref<HTMLElement | null>(null);
const artistsAtStart = ref(true);
const artistsAtEnd = ref(false);

function checkArtistsScroll() {
  const el = artistsScroll.value;
  if (!el) return;
  artistsAtStart.value = el.scrollLeft <= 10;
  artistsAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
}

let resizeObserver: ResizeObserver | null = null;

watch(artistsScroll, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) {
    resizeObserver?.observe(el);
    checkArtistsScroll();
  }
});

function scrollArtists(direction: number) {
  const el = artistsScroll.value;
  if (el) {
    el.scrollLeft += direction * 600;
  }
}

// Playlists slider helpers
const playlistsScroll = ref<HTMLElement | null>(null);
const playlistsAtStart = ref(true);
const playlistsAtEnd = ref(false);

function checkPlaylistsScroll() {
  const el = playlistsScroll.value;
  if (!el) return;
  playlistsAtStart.value = el.scrollLeft <= 10;
  playlistsAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
}

watch(playlistsScroll, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) {
    resizeObserver?.observe(el);
    checkPlaylistsScroll();
  }
});

function scrollPlaylists(direction: number) {
  const el = playlistsScroll.value;
  if (el) {
    el.scrollLeft += direction * 600;
  }
}

// Library slider helpers
const libraryScroll = ref<HTMLElement | null>(null);
const libraryAtStart = ref(true);
const libraryAtEnd = ref(false);

function checkLibraryScroll() {
  const el = libraryScroll.value;
  if (!el) return;
  libraryAtStart.value = el.scrollLeft <= 10;
  libraryAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
}

watch(libraryScroll, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) {
    resizeObserver?.observe(el);
    checkLibraryScroll();
  }
});

function scrollLibrary(direction: number) {
  const el = libraryScroll.value;
  if (el) {
    el.scrollLeft += direction * el.clientWidth * 0.85;
  }
}

// VK Tracks slider helpers
const vkTracksScroll = ref<HTMLElement | null>(null);
const vkTracksAtStart = ref(true);
const vkTracksAtEnd = ref(false);

let vkScrollTimeout: any = null;
function checkVkTracksScroll() {
  const el = vkTracksScroll.value;
  if (!el) return;
  vkTracksAtStart.value = el.scrollLeft <= 10;
  vkTracksAtEnd.value = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
  
  if (vkScrollTimeout) clearTimeout(vkScrollTimeout);
  vkScrollTimeout = setTimeout(() => {
    // el.scrollWidth includes the 65vw padding block at the end.
    // We want to trigger loadMore when the user reaches the end of the ACTUAL tracks,
    // which is about (window.innerWidth * 0.65) + 400 pixels before the scrollWidth.
    const paddingWidth = window.innerWidth * 0.65;
    if (el.scrollLeft + el.clientWidth >= el.scrollWidth - paddingWidth - 400) {
      loadMore();
    }
  }, 150);
}

watch(vkTracksScroll, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) {
    resizeObserver?.observe(el);
    checkVkTracksScroll();
  }
});

function scrollVkTracks(direction: number) {
  const el = vkTracksScroll.value;
  if (el) {
    el.scrollLeft += direction * el.clientWidth * 0.85;
  }
}

async function runGlobal() {
  const q = query.value.trim();
  if (!q) {
    libraryMatches.value = [];
    results.value = [];
    searchArtists.value = [];
    searchPlaylists.value = [];
    total.value = 0;
    return;
  }
  const token = ++runToken;
  loading.value = true;
  error.value = null;

  // Add to history
  searchHistory.value = [q, ...searchHistory.value.filter(x => x.toLowerCase() !== q.toLowerCase())].slice(0, 15);
  saveHistory();

  try {
    const [res, countRes, ownRes] = await Promise.all([
      api.searchCatalog({ q }),
      api.search({ q, count: 1, performer_only: false }).catch(() => null),
      api.search({ q, count: 50, search_own: true }).catch(() => null),
    ]);
    if (token !== runToken) return;
    
    // We now fetch libraryMatches directly from VK using search_own: true
    libraryMatches.value = ownRes ? ownRes.items : [];
    
    // Filter out user's library tracks from global tracks to prevent duplicates
    const myIds = new Set(libraryMatches.value.map(t => `${t.owner_id}_${t.id}`));
    results.value = res.tracks.filter(t => !myIds.has(`${t.owner_id}_${t.id}`));
    
    searchArtists.value = res.artists;
    searchPlaylists.value = res.playlists;
    total.value = countRes ? countRes.count : (res.tracks.length > 0 ? 1000000 : 0);
  } catch (err) {
    if (token !== runToken) return;
    error.value =
      err instanceof APIError ? err.detail.message || "Не удалось" : (err as Error).message;
  } finally {
    if (token === runToken) loading.value = false;
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value || loading.value) return;
  const q = query.value.trim();
  if (!q) return;
  const token = runToken;
  loadingMore.value = true;
  try {
    const list = await api.search({
      q,
      performer_only: false,
      count: PAGE_SIZE,
      offset: results.value.length,
    });
    if (token !== runToken) return;
    const have = new Set(results.value.map((t) => `${t.owner_id}_${t.id}`));
    const fresh = list.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`) && t.url);
    results.value = [...results.value, ...fresh];
    if (list.count > 0) total.value = list.count;
  } catch {
    // swallow — next scroll will retry
  } finally {
    if (token === runToken) loadingMore.value = false;
  }
}

watch(query, (value) => {
  if (debounceHandle) window.clearTimeout(debounceHandle);
  const next = value.trim();
  const current = typeof route.query.q === "string" ? route.query.q : "";
  if (next !== current) {
    void router.replace({ name: "search", query: next ? { q: next } : undefined });
  }
  debounceHandle = window.setTimeout(() => {
    void runGlobal();
  }, debounceMs);
});

watch(
  () => route.query.q,
  (value) => {
    const incoming = typeof value === "string" ? value : "";
    if (incoming !== query.value) query.value = incoming;
  }
);

async function onSearchNearEnd() {
  if (!hasMore.value || loadingMore.value) return;
  const q = query.value.trim();
  if (!q) return;
  const token = runToken;
  loadingMore.value = true;
  try {
    const list = await api.search({
      q,
      performer_only: false,
      count: PAGE_SIZE,
      offset: results.value.length,
    });
    if (token !== runToken) return;
    const have = new Set(results.value.map((t) => `${t.owner_id}_${t.id}`));
    const fresh = list.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
    results.value = [...results.value, ...fresh];
    if (list.count > 0) total.value = list.count;
    
    const newPlayable = fresh.filter((t) => t.url);
    if (newPlayable.length > 0) {
      player.appendTracksToQueue(newPlayable);
    }
  } catch (err) {
    console.error("Failed to load more search tracks in player callback", err);
  } finally {
    if (token === runToken) loadingMore.value = false;
  }
}

function handlePlay(_track: Track, index: number) {
  player.playQueue(results.value, index, { autoPlay: true }, onSearchNearEnd);
}

async function playAlbum(album: AlbumSummary) {
  if (album.owner_id == null) return;
  try {
    const res = await api.playlistTracks(album.owner_id, parseInt(album.id), { count: 200 });
    if (res.items && res.items.length > 0) {
      player.playQueue(res.items, 0, { autoPlay: true }, undefined, album);
    } else {
      ui.notify("Плейлист пуст", "error");
    }
  } catch (e) {
    ui.notify("Не удалось загрузить треки", "error");
  }
}
</script>

<template>
  <ScrollArea @reach-end="loadMore">
    <PageHeader title="Найти музыку">
      <template #actions>
        <div class="search__bar">
          <input
            v-model="query"
            class="input search__input"
            placeholder="Название трека или исполнителя"
            autofocus
          />
        </div>
        <button class="btn btn--ghost" @click="router.back()">Назад</button>
      </template>
    </PageHeader>

    <section class="search">
      <div v-if="loading" class="search__loading-centered">
        <Spinner :size="48" />
      </div>
      <div v-else-if="error" class="search__error">{{ error }}</div>
      <div v-else-if="!query.trim()">
        <div v-if="searchHistory.length" class="search__history">
          <div class="search__head">
            <h3 class="search__section-title">История поиска</h3>
            <button class="btn btn--ghost search__history-clear" @click="clearHistory">Очистить</button>
          </div>
          <div class="search__history-list">
            <div v-for="h in searchHistory" :key="h" class="search__history-item" @click="query = h" role="button" tabindex="0">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span>{{ h }}</span>
              <button class="search__history-remove" @click.stop="removeFromHistory(h)" title="Удалить">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <EmptyState v-else title="Начни печатать" subtitle="Введи название или исполнителя — поиск стартует автоматически" />
      </div>
      <div v-else class="search__pane">
<div v-if="libraryMatches.length" class="search__library-section">
          <div class="search__head">
            <h3 class="search__section-title">Мои треки</h3>
          </div>
          <div class="search__slider-container">
            <button :class="{ 'search__slider-btn--hidden': libraryAtStart }" class="search__slider-btn search__slider-btn--prev" @click="scrollLibrary(-1)" aria-label="Листать влево">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div class="search__library-slider" ref="libraryScroll" @scroll="checkLibraryScroll">
              <SliderTrackRow 
                v-for="t in libraryMatches" 
                :key="t.owner_id + '_' + t.id"
                :track="t"
                @play="player.playQueue(libraryMatches, libraryMatches.findIndex(x => x.id === t.id), { autoPlay: true })"
              />
            </div>
            <button :class="{ 'search__slider-btn--hidden': libraryAtEnd }" class="search__slider-btn search__slider-btn--next" @click="scrollLibrary(1)" aria-label="Листать вправо">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>

        <div v-if="results.length" class="search__tracks-section">
          <div class="search__head">
            <h3 class="search__section-title">Все треки</h3>
          </div>
          <div class="search__slider-container">
            <button :class="{ 'search__slider-btn--hidden': vkTracksAtStart }" class="search__slider-btn search__slider-btn--prev" @click="scrollVkTracks(-1)" aria-label="Листать влево">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div class="search__library-slider" ref="vkTracksScroll" @scroll="checkVkTracksScroll">
              <SliderTrackRow 
                v-for="(t, idx) in results" 
                :key="t.owner_id + '_' + t.id + '_' + idx"
                :track="t"
                @play="handlePlay(t, idx)"
              />
              <template v-if="loadingMore">
                <div v-for="i in 9" :key="'skel-'+i" class="search__skeleton-track"></div>
              </template>
            </div>
            <button :class="{ 'search__slider-btn--hidden': vkTracksAtEnd }" class="search__slider-btn search__slider-btn--next" @click="scrollVkTracks(1)" aria-label="Листать вправо">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>

        <div v-if="searchPlaylists.length" class="search__playlists-section">
          <h3 class="search__section-title">Альбомы</h3>
          <div class="search__slider-container">
            <button :class="{ 'search__slider-btn--hidden': playlistsAtStart }" class="search__slider-btn search__slider-btn--prev" @click="scrollPlaylists(-1)" aria-label="Листать влево">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div class="search__playlists" ref="playlistsScroll" @scroll="checkPlaylistsScroll">
              <RecommendationCard v-for="(p, idx) in searchPlaylists" :key="p.id" :block="p" :index="idx" @open="playAlbum" />
            </div>
            <button :class="{ 'search__slider-btn--hidden': playlistsAtEnd }" class="search__slider-btn search__slider-btn--next" @click="scrollPlaylists(1)" aria-label="Листать вправо">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>

        <div v-if="searchArtists.length" class="search__artists-section">
          <h3 class="search__section-title">Исполнители</h3>
          <div class="search__slider-container">
            <button :class="{ 'search__slider-btn--hidden': artistsAtStart }" class="search__slider-btn search__slider-btn--prev" @click="scrollArtists(-1)" aria-label="Листать влево">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div class="search__artists" ref="artistsScroll" @scroll="checkArtistsScroll">
              <ArtistCard v-for="(a, idx) in searchArtists" :key="a.id" :artist="a" :index="idx" />
            </div>
            <button :class="{ 'search__slider-btn--hidden': artistsAtEnd }" class="search__slider-btn search__slider-btn--next" @click="scrollArtists(1)" aria-label="Листать вправо">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  </ScrollArea>
</template>

<style scoped>
.search {
  padding: 0 32px 24px;
}
.search__bar {
  display: flex;
  flex: 1 1 360px;
  align-items: center;
  gap: 14px;
}
.search__input {
  flex: 1 1 auto;
  min-width: 240px;
  height: 42px;
}
.search__pane {
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.search__library-section,
.search__artists-section,
.search__playlists-section,
.search__tracks-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.search__section-title {
  font-size: calc(16px * var(--font-scale, 1));
  font-weight: 700;
  margin: 0;
  color: var(--text-0);
}
.search__library-slider {
  display: grid;
  grid-template-rows: repeat(3, auto);
  grid-auto-flow: column;
  grid-auto-columns: calc((100% - 16px) / 2.5);
  gap: 8px 16px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 8px;
  scroll-behavior: smooth;
  scroll-snap-type: x mandatory;
}

.search__library-slider::after {
  content: "";
  display: block;
  grid-row: 1 / -1;
  width: 65vw; /* Placeholder at the end */
}
.search__library-slider > * {
  scroll-snap-align: start;
}
.search__library-slider::-webkit-scrollbar {
  display: none;
}
.search__artists {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-top: 16px;
  padding-bottom: 24px;
  margin-top: -16px;
  margin-bottom: -24px;
  scroll-behavior: smooth;
}
.search__artists::after {
  content: "";
  display: block;
  min-width: 65vw;
}
.search__artists::-webkit-scrollbar {
  display: none;
}
.search__playlists {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-top: 16px;
  padding-bottom: 24px;
  margin-top: -16px;
  margin-bottom: -24px;
  scroll-behavior: smooth;
}
.search__playlists::after {
  content: "";
  display: block;
  min-width: 65vw;
}
.search__playlists::-webkit-scrollbar {
  display: none;
}
.search__slider-container {
  position: relative;
  margin: 0 -32px;
  padding: 0 32px;
}
.search__slider-btn {
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
.search__slider-container:hover .search__slider-btn:not(.search__slider-btn--hidden) {
  opacity: 1;
}
.search__slider-btn:hover:not(.search__slider-btn--hidden) {
  background: var(--bg-3);
  transform: translateY(-50%) scale(1.1);
}
.search__slider-btn--hidden {
  opacity: 0 !important;
  pointer-events: none;
  transform: translateY(-50%) scale(0.8) !important;
}
.search__slider-btn--prev {
  left: 16px;
}
.search__slider-btn--next {
  right: 16px;
}
.search__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
}
.search__loading-centered {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 0;
  color: var(--text-2);
}
.search__error {
  color: var(--danger);
  padding: 12px 0;
  font-size: calc(13px * var(--font-scale, 1));
}
.search__skeleton-track {
  height: 52px;
  border-radius: var(--radius-md);
  background: var(--bg-2);
  animation: skel-pulse 1.5s infinite;
}
@keyframes skel-pulse {
  0% { opacity: 0.4; }
  50% { opacity: 0.8; }
  100% { opacity: 0.4; }
}
.search__history {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.search__history-clear {
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
}
.search__history-list {
  display: flex;
  flex-direction: column;
}
.search__history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-1);
  font-size: calc(14px * var(--font-scale, 1));
  text-align: left;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;
}
.search__history-item:hover {
  background: var(--bg-2);
  color: var(--text-0);
}
.search__history-item span {
  flex: 1;
}
.search__history-remove {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--text-2);
  opacity: 0;
  transition: background 0.2s, color 0.2s, opacity 0.2s;
}
.search__history-item:hover .search__history-remove {
  opacity: 1;
}
.search__history-remove:hover {
  background: var(--bg-3);
  color: var(--danger);
}
</style>
