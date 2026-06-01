<script setup lang="ts">
import { computed, onMounted, ref, watch, nextTick, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { api, APIError } from "@/api/client";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import type { Artist, Track } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import ArtistCard from "@/components/ArtistCard.vue";
import EmptyState from "@/components/EmptyState.vue";
import Spinner from "@/components/Spinner.vue";

type Scope = "global" | "library";

const PAGE_SIZE = 100;

const library = useLibraryStore();
const player = usePlayerStore();
const router = useRouter();
const route = useRoute();
const { myMusic } = storeToRefs(library);

const query = ref(typeof route.query.q === "string" ? route.query.q : "");
const scope = ref<Scope>("global");
const debounceMs = 350;

const results = ref<Track[]>([]);
const total = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref<string | null>(null);

const hasMore = computed(() => total.value > 0 && results.value.length < total.value);

let debounceHandle: number | null = null;
let runToken = 0;

onMounted(() => {
  void library.loadMyMusic();
  if (query.value.trim()) void runGlobal();

  resizeObserver = new ResizeObserver(() => {
    checkArtistsScroll();
  });
  if (artistsScroll.value) {
    resizeObserver.observe(artistsScroll.value);
  }
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
});

const libraryMatches = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return myMusic.value.filter(
    (t: Track) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
});

const searchArtistsRaw = computed(() => {
  if (scope.value !== "global") return [];
  const map = new Map<string, { id: string; name: string }>();
  for (const t of results.value) {
    if (t.main_artists) {
      for (const a of t.main_artists) {
        if (a.id && !map.has(a.id)) {
          map.set(a.id, { id: a.id, name: a.name });
        }
      }
    }
  }
  return Array.from(map.values()).slice(0, 8);
});

const searchArtists = ref<Artist[]>([]);

watch(searchArtistsRaw, async (rawArtists) => {
  // Reset or update searchArtists
  // We keep existing ones to prevent flicker, and fetch new ones
  const currentMap = new Map(searchArtists.value.map(a => [a.id, a]));
  const newList: Artist[] = [];
  
  for (const raw of rawArtists) {
    if (currentMap.has(raw.id)) {
      newList.push(currentMap.get(raw.id)!);
    } else {
      // push a stub first
      const stub: Artist = {
        id: raw.id,
        name: raw.name,
        domain: null,
        photo: null,
        banner: null,
        is_followed: false,
      };
      newList.push(stub);
      // fetch actual
      api.artist(raw.id, { name: raw.name }).then(fullArtist => {
        const idx = searchArtists.value.findIndex(a => a.id === fullArtist.id);
        if (idx !== -1) {
          searchArtists.value[idx] = fullArtist;
        }
      }).catch(() => {});
    }
  }
  searchArtists.value = newList;
  nextTick(() => {
    checkArtistsScroll();
  });
}, { immediate: true });

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

async function runGlobal() {
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    total.value = 0;
    return;
  }
  const token = ++runToken;
  loading.value = true;
  error.value = null;
  try {
    const list = await api.search({ q, performer_only: false, count: PAGE_SIZE, offset: 0 });
    if (token !== runToken) return; // user typed something newer
    results.value = list.items;
    total.value = list.count;
  } catch (err) {
    if (token !== runToken) return;
    error.value =
      err instanceof APIError ? err.detail.message || "Не удалось" : (err as Error).message;
  } finally {
    if (token === runToken) loading.value = false;
  }
}

async function loadMore() {
  if (scope.value !== "global") return;
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
    const fresh = list.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
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
  // Reflect query into URL so deep links / 'find similar' work both ways.
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

function playMany(tracks: Track[]) {
  if (tracks.length) player.playQueue(tracks);
}
</script>

<template>
  <ScrollArea @reach-end="loadMore">
    <PageHeader eyebrow="Поиск" title="Найти музыку" subtitle="Один запрос — ищем по всей ВК и в твоей библиотеке. Переключай вкладки ниже.">
      <template #actions>
        <div class="search__bar">
          <input
            v-model="query"
            class="input search__input"
            placeholder="Название трека или исполнителя"
            autofocus
          />
        </div>
        <div class="search__segmented" role="tablist">
          <button
            class="search__seg"
            :class="{ 'search__seg--active': scope === 'global' }"
            @click="scope = 'global'"
            role="tab"
            :aria-selected="scope === 'global'"
          >
            Везде
          </button>
          <button
            class="search__seg"
            :class="{ 'search__seg--active': scope === 'library' }"
            @click="scope = 'library'"
            role="tab"
            :aria-selected="scope === 'library'"
          >
            В библиотеке
          </button>
        </div>
        <button class="btn btn--ghost" @click="router.back()">Назад</button>
      </template>
    </PageHeader>

    <section class="search">
      <template v-if="scope === 'global'">
        <div v-if="loading" class="search__loading"><Spinner :size="18" /> Ищем «{{ query }}»…</div>
        <div v-else-if="error" class="search__error">{{ error }}</div>
        <div v-else-if="!query.trim()">
          <EmptyState title="Начни печатать" subtitle="Введи название или исполнителя — поиск стартует автоматически" />
        </div>
        <div v-else class="search__pane">
          <div v-if="searchArtists.length" class="search__artists-section">
            <h3 class="search__section-title">Артисты</h3>
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
          <div class="search__head">
            <span>Найдено треков: {{ total || results.length }}</span>
            <button class="btn btn--ghost" :disabled="!results.length" @click="playMany(results)">
              Слушать всё
            </button>
          </div>
          <TrackList :tracks="results" show-index empty-title="Ничего не нашлось" />
          <div v-if="loadingMore" class="search__loading">
            <Spinner :size="16" /> Подгружаем ещё…
          </div>
        </div>
      </template>

      <template v-else>
        <div v-if="!query.trim()">
          <EmptyState title="Поиск в твоей музыке" subtitle="Введи название — поищем в локально сохранённой библиотеке" />
        </div>
        <div v-else class="search__pane">
          <div class="search__head">
            <span>Найдено в библиотеке: {{ libraryMatches.length }}</span>
            <button
              class="btn btn--ghost"
              :disabled="!libraryMatches.length"
              @click="playMany(libraryMatches)"
            >
              Слушать всё
            </button>
          </div>
          <TrackList
            :tracks="libraryMatches"
            show-index
            empty-title="Ничего не нашлось"
            empty-subtitle="Сохрани трек в библиотеку, чтобы он появлялся здесь"
          />
        </div>
      </template>
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
.search__segmented {
  display: inline-flex;
  padding: 4px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  gap: 2px;
}
.search__seg {
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  transition:
    background var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
}
.search__seg:hover:not(.search__seg--active) {
  color: var(--text-0);
}
.search__seg--active {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: var(--accent-text, #fff);
}
.search__pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.search__artists-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}
.search__section-title {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: var(--text-0);
}
.search__artists {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 4px;
  scroll-behavior: smooth;
}
.search__artists::-webkit-scrollbar {
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
  font-size: 13px;
}
.search__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  padding: 12px 0;
}
.search__error {
  color: var(--danger);
  padding: 12px 0;
  font-size: 13px;
}
</style>
