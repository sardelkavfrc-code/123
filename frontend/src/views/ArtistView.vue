<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, APIError } from "@/api/client";
import type { ArtistAlbumBlock, Artist, Track, AlbumSummary } from "@/api/types";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import RecommendationCard from "@/components/RecommendationCard.vue";
import { tracksLabel } from "@/composables/useFormat";

const PAGE_SIZE = 100;

type ArtistTab = "all" | "albums";

const props = defineProps<{ id: string }>();
const router = useRouter();
const route = useRoute();
const player = usePlayerStore();
const ui = useUIStore();

const artist = ref<Artist | null>(null);
const tracks = ref<Track[]>([]);
const tracksTotal = ref(0);
const tracksLoadingMore = ref(false);

const albumsBlocks = ref<ArtistAlbumBlock[]>([]);
const albumsLoading = ref(false);
const albumsLoaded = ref(false);
const albumsError = ref<string | null>(null);
const loadingAlbumId = ref<string | null>(null);

const tab = ref<ArtistTab>("all");

const loading = ref(false);
const error = ref<string | null>(null);
const tracksWarning = ref<string | null>(null);

const hintedName = computed(() => {
  const v = route.query.name;
  return typeof v === "string" ? v : null;
});

const tracksHasMore = computed(
  () => tracksTotal.value > 0 && tracks.value.length < tracksTotal.value
);

async function load() {
  loading.value = true;
  error.value = null;
  tracksWarning.value = null;
  artist.value = null;
  tracks.value = [];
  tracksTotal.value = 0;
  
  albumsBlocks.value = [];
  albumsLoaded.value = false;
  albumsError.value = null;
  loadingAlbumId.value = null;
  tab.value = "all";

  const name = hintedName.value ?? undefined;

  const [infoRes, listRes] = await Promise.allSettled([
    api.artist(props.id, name ? { name } : {}),
    api.byArtist(props.id, { count: PAGE_SIZE, offset: 0, ...(name ? { q: name } : {}) }),
  ]);

  if (infoRes.status === "fulfilled") {
    artist.value = infoRes.value;
    const bgUrl = artist.value.banner || artist.value.photo;
    if (bgUrl) {
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = bgUrl;
      });
    }
  } else {
    artist.value = {
      id: props.id,
      name: name ?? props.id,
      domain: null,
      photo: null,
      banner: null,
      is_followed: false,
    };
  }

  if (listRes.status === "fulfilled") {
    tracks.value = listRes.value.items;
    tracksTotal.value = listRes.value.count;
  } else {
    const reason = listRes.reason;
    tracksWarning.value =
      reason instanceof APIError
        ? reason.detail.message || "Не удалось загрузить треки артиста"
        : (reason as Error).message || "Не удалось загрузить треки артиста";
  }

  if (!artist.value && !tracks.value.length) {
    error.value = "Артист не найден";
  }

  loading.value = false;
}

async function loadMoreTracks() {
  if (!tracksHasMore.value || tracksLoadingMore.value || loading.value) return;
  if (tab.value !== "all") return;
  tracksLoadingMore.value = true;
  try {
    const name = hintedName.value ?? undefined;
    const list = await api.byArtist(props.id, {
      count: PAGE_SIZE,
      offset: tracks.value.length,
      ...(name ? { q: name } : {}),
    });
    const have = new Set(tracks.value.map((t) => `${t.owner_id}_${t.id}`));
    const fresh = list.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
    tracks.value = [...tracks.value, ...fresh];
    if (list.count > 0) tracksTotal.value = list.count;
  } catch {
    // swallow
  } finally {
    tracksLoadingMore.value = false;
  }
}

async function ensureAlbums() {
  if (albumsLoaded.value || albumsLoading.value) return;
  albumsLoading.value = true;
  albumsError.value = null;
  try {
    const res = await api.artistAlbums(props.id);
    albumsBlocks.value = res.blocks || [];
  } catch (err) {
    albumsError.value =
      err instanceof APIError
        ? err.detail.message || "Альбомы недоступны"
        : "Альбомы недоступны";
  } finally {
    albumsLoading.value = false;
    albumsLoaded.value = true;
  }
}

async function playAlbum(album: AlbumSummary) {
  if (album.owner_id == null) {
    ui.notify("Неверный альбом", "error");
    return;
  }
  if (loadingAlbumId.value) return;
  
  loadingAlbumId.value = album.id;
  try {
    const numericId = Number(album.id.split("_").pop() || album.id);
    const list = await api.playlistTracks(album.owner_id, numericId, { count: 200 });
    if (list.items && list.items.length > 0) {
      player.playQueue(list.items, 0);
    } else {
      ui.notify("Альбом пуст", "error");
    }
  } catch {
    ui.notify("Не удалось открыть альбом", "error");
  } finally {
    loadingAlbumId.value = null;
  }
}

function scrollSlider(idx: number, direction: number) {
  const el = document.getElementById(`artist-slider-${idx}`);
  if (el) {
    el.scrollLeft += direction * 600;
  }
}

watch(tab, (next) => {
  if (next === "albums") void ensureAlbums();
});

onMounted(load);
watch(() => props.id, load);
watch(() => route.query.name, load);

function playAll() {
  if (tracks.value.length) player.playQueue(tracks.value);
}
</script>

<template>
  <ScrollArea @reach-end="loadMoreTracks">
    <div v-if="loading" class="artist__loading-full">
      <Spinner :size="32" /> 
      <div style="margin-top: 16px; color: var(--text-2);">Загружаем артиста…</div>
    </div>
    <div v-else-if="error" class="artist__error-full">{{ error }}</div>
    
    <template v-else>
      <section
        class="artist__hero"
        :style="(artist?.banner || artist?.photo) ? { backgroundImage: `linear-gradient(to top, var(--bg-1) 0%, rgba(17, 19, 25, 0.4) 100%), url(${artist.banner || artist.photo})` } : undefined"
      >
        <div class="artist__hero-inner">
          <div class="artist__hero-content">
            <div class="artist__eyebrow">Артист</div>
            <h1 class="artist__name">{{ artist?.name ?? "Загрузка…" }}</h1>
            <div class="artist__meta">
              <span v-if="tracks.length">{{ tracksLabel(tracksTotal || tracks.length) }}</span>
              <span v-if="artist?.is_followed" class="chip chip--active">Подписка</span>
            </div>
          </div>
          <div class="artist__actions">
            <button class="btn btn--primary" :disabled="!tracks.length" @click="playAll">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              Слушать всё
            </button>
            <button class="btn btn--ghost" @click="router.back()">Назад</button>
          </div>
        </div>
      </section>

      <nav class="artist__tabs" role="tablist">
        <button
          class="artist__tab"
          :class="{ 'artist__tab--active': tab === 'all' }"
          role="tab"
          :aria-selected="tab === 'all'"
          @click="tab = 'all'"
        >
          Все треки
        </button>
        <button
          class="artist__tab"
          :class="{ 'artist__tab--active': tab === 'albums' }"
          role="tab"
          :aria-selected="tab === 'albums'"
          @click="tab = 'albums'"
        >
          Альбомы
        </button>
      </nav>

      <section class="artist__body">
        <Transition name="fade-slide" mode="out-in">
        <div :key="tab" class="artist__tab-pane">
          <template v-if="tab === 'all'">
            <div v-if="tracksWarning" class="artist__warn">{{ tracksWarning }}</div>
            <TrackList
              :tracks="tracks"
              show-index
              empty-title="У артиста пока нет треков"
            />
            <div v-if="tracksLoadingMore" class="artist__loading">
              <Spinner :size="16" /> Подгружаем ещё…
            </div>
          </template>

          <template v-else-if="tab === 'albums'">
            <div v-if="albumsLoading" class="artist__loading"><Spinner :size="16" /> Грузим альбомы…</div>
            <div v-else-if="albumsError" class="artist__warn">{{ albumsError }}</div>
            <div v-else-if="!albumsBlocks.length" class="artist__warn">
              У артиста нет альбомов, либо ВК их не отдал.
            </div>
            <div v-else class="artist__albums-blocks">
              <div v-for="(block, idx) in albumsBlocks" :key="idx" class="artist__album-section">
                <div class="artist__section-head">
                  <h2>{{ block.title }}</h2>
                </div>
                <div class="artist__slider-container">
                  <button class="artist__slider-btn artist__slider-btn--prev" @click="scrollSlider(idx, -1)" aria-label="Листать влево">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                  <div :id="`artist-slider-${idx}`" class="artist__slider">
                    <RecommendationCard
                      v-for="(album, i) in block.albums"
                      :key="album.id"
                      :block="album"
                      :index="i"
                      :show-hover-meta="true"
                      :loading="loadingAlbumId === album.id"
                      @open="playAlbum"
                    />
                  </div>
                  <button class="artist__slider-btn artist__slider-btn--next" @click="scrollSlider(idx, 1)" aria-label="Листать вправо">
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              </div>
            </div>
          </template>
        </div>
      </Transition>
      </section>
    </template>
  </ScrollArea>
</template>

<style scoped>
.artist__loading-full {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 400px;
}
.artist__error-full {
  text-align: center;
  padding: 40px;
  color: var(--text-2);
}
.artist__hero {
  position: relative;
  margin: 16px 32px 0;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  background-size: cover;
  background-position: center 30%;
  color: #fff;
  overflow: hidden;
  min-height: 280px;
  display: flex;
  align-items: stretch;
}
.artist__hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to right, rgba(0,0,0,0.6) 0%, transparent 100%);
  z-index: 1;
}
.artist__hero-inner {
  position: relative;
  z-index: 2;
  padding: 32px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 24px;
  width: 100%;
}
.artist__hero-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.artist__eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  opacity: 0.9;
  font-weight: 700;
}
.artist__name {
  margin: 0;
  font-size: 48px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.1;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}
.artist__meta {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 14px;
  font-weight: 500;
}
.artist__actions {
  display: flex;
  gap: 12px;
}
.artist__actions .btn {
  border-radius: 999px;
  padding: 0 24px;
  height: 44px;
  font-size: 14px;
  font-weight: 600;
}
.artist__actions .btn--primary {
  background: var(--text-0);
  color: var(--bg-0);
}
.artist__actions .btn--primary:hover {
  transform: scale(1.02);
  background: #fff;
}
.artist__actions .btn--ghost {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}
.artist__actions .btn--ghost:hover {
  background: rgba(255, 255, 255, 0.2);
}
.artist__body {
  padding: 0 32px 24px;
}
.artist__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  padding: 12px 0;
}
.artist__error {
  color: var(--danger);
  padding: 12px 0;
  font-size: 13px;
}
.artist__warn {
  color: var(--text-2);
  background: var(--bg-2);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 13px;
}
.artist__tabs {
  display: inline-flex;
  gap: 4px;
  margin: 20px 32px 12px;
  padding: 4px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 999px;
}
.artist__tab {
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  transition:
    background var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
}
.artist__tab:hover:not(.artist__tab--active) {
  color: var(--text-0);
}
.artist__tab--active {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: var(--accent-text, #fff);
}
.artist__tab-pane {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.artist__albums-blocks {
  display: flex;
  flex-direction: column;
  gap: 32px;
  margin-top: 8px;
}
.artist__album-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.artist__section-head h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--text-0);
}
.artist__slider-container {
  position: relative;
  margin: 0 -32px;
  padding: 0 32px;
}
.artist__slider-btn {
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
.artist__slider-container:hover .artist__slider-btn {
  opacity: 1;
}
.artist__slider-btn:hover {
  background: var(--bg-3);
  transform: translateY(-50%) scale(1.1);
}
.artist__slider-btn--prev {
  left: 16px;
}
.artist__slider-btn--next {
  right: 16px;
}
.artist__slider {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scrollbar-width: none;
  padding-bottom: 4px;
  scroll-behavior: smooth;
}
.artist__slider::-webkit-scrollbar {
  display: none;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.25s var(--motion-ease-out), transform 0.25s var(--motion-ease-out);
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
