<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, APIError } from "@/api/client";
import type { AlbumSummary, Artist, Track } from "@/api/types";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import { tracksLabel } from "@/composables/useFormat";

const PAGE_SIZE = 100;

type ArtistTab = "all" | "albums" | "similar";

const props = defineProps<{ id: string }>();
const router = useRouter();
const route = useRoute();
const player = usePlayerStore();
const ui = useUIStore();

const artist = ref<Artist | null>(null);
const tracks = ref<Track[]>([]);
const tracksTotal = ref(0);
const tracksLoadingMore = ref(false);
const similar = ref<Track[]>([]);
const similarLoading = ref(false);
const albums = ref<AlbumSummary[]>([]);
const albumsLoading = ref(false);
const albumsLoaded = ref(false);
const albumsError = ref<string | null>(null);
const openAlbumId = ref<string | null>(null);
const albumTracks = ref<Record<string, Track[]>>({});
const albumTracksLoading = ref<Record<string, boolean>>({});
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
  similar.value = [];
  albums.value = [];
  albumsLoaded.value = false;
  albumsError.value = null;
  openAlbumId.value = null;
  albumTracks.value = {};
  albumTracksLoading.value = {};
  tab.value = "all";

  // Run both calls independently — under the vk.com web token from
  // vkhost.github.io, artist methods may partially fail. Each side
  // falls back to a stub so the screen still renders something useful.
  const name = hintedName.value ?? undefined;

  const [infoRes, listRes] = await Promise.allSettled([
    api.artist(props.id, name ? { name } : {}),
    api.byArtist(props.id, { count: PAGE_SIZE, offset: 0, ...(name ? { q: name } : {}) }),
  ]);

  if (infoRes.status === "fulfilled") {
    artist.value = infoRes.value;
  } else {
    artist.value = {
      id: props.id,
      name: name ?? props.id,
      domain: null,
      photo: null,
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

  loadSimilar();

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
    // swallow — retry on next scroll
  } finally {
    tracksLoadingMore.value = false;
  }
}

async function loadSimilar() {
  if (!tracks.value.length) return;
  if (similar.value.length || similarLoading.value) return;
  similarLoading.value = true;
  try {
    const first = tracks.value.find((t) => !!t.url) ?? tracks.value[0];
    const sim = await api.recommendations({
      target_audio: `${first.owner_id}_${first.id}`,
      count: 60,
    });
    similar.value = sim.items.filter(
      (t) => !tracks.value.some((tt) => tt.id === t.id && tt.owner_id === t.owner_id)
    );
  } catch {
    // recommendations are nice-to-have, swallow
  } finally {
    similarLoading.value = false;
  }
}

async function ensureAlbums() {
  if (albumsLoaded.value || albumsLoading.value) return;
  albumsLoading.value = true;
  albumsError.value = null;
  try {
    const res = await api.artistAlbums(props.id);
    albums.value = res.items;
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

async function toggleAlbum(album: AlbumSummary) {
  if (album.owner_id == null) {
    ui.notify("Неверный альбом", "error");
    return;
  }
  if (openAlbumId.value === album.id) {
    openAlbumId.value = null;
    return;
  }
  openAlbumId.value = album.id;
  if (albumTracks.value[album.id]) return;
  albumTracksLoading.value = { ...albumTracksLoading.value, [album.id]: true };
  try {
    const numericId = Number(album.id.split("_").pop());
    const list = await api.playlistTracks(album.owner_id, numericId, { count: 100 });
    albumTracks.value = { ...albumTracks.value, [album.id]: list.items };
  } catch {
    ui.notify("Не удалось открыть альбом", "error");
  } finally {
    albumTracksLoading.value = { ...albumTracksLoading.value, [album.id]: false };
  }
}

function playAlbum(album: AlbumSummary) {
  const list = albumTracks.value[album.id];
  if (list && list.length) player.playQueue(list);
}

watch(tab, (next) => {
  if (next === "albums") void ensureAlbums();
  if (next === "similar" && !similar.value.length) void loadSimilar();
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
    <section
      class="artist__hero"
      :style="artist?.photo ? { backgroundImage: `linear-gradient(to top, var(--bg-1) 0%, rgba(17, 19, 25, 0.4) 100%), url(${artist.photo})` } : undefined"
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
      <button
        class="artist__tab"
        :class="{ 'artist__tab--active': tab === 'similar' }"
        role="tab"
        :aria-selected="tab === 'similar'"
        @click="tab = 'similar'"
      >
        Похожие
      </button>
    </nav>

    <section class="artist__body">
      <div v-if="loading" class="artist__loading"><Spinner :size="20" /> Загружаем артиста…</div>
      <div v-else-if="error" class="artist__error">{{ error }}</div>
      <template v-else>
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
          <div v-else-if="!albums.length" class="artist__warn">
            У артиста нет альбомов, либо ВК их не отдал.
          </div>
          <div v-else class="artist__albums">
            <div
              v-for="album in albums"
              :key="album.id"
              class="artist__album"
              :class="{ 'artist__album--open': openAlbumId === album.id }"
            >
              <button class="artist__album-head" @click="toggleAlbum(album)">
                <div class="artist__album-cover">
                  <img v-if="album.cover" :src="album.cover" :alt="album.title" loading="lazy" />
                  <span v-else>{{ album.title.charAt(0) }}</span>
                </div>
                <div class="artist__album-meta">
                  <div class="artist__album-title">{{ album.title }}</div>
                  <div class="artist__album-sub">
                    <span v-if="album.year">{{ album.year }}</span>
                    <span v-if="album.track_count">· {{ tracksLabel(album.track_count) }}</span>
                    <span v-if="album.subtitle">· {{ album.subtitle }}</span>
                  </div>
                </div>
                <span class="artist__album-caret" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path :d="openAlbumId === album.id ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'" />
                  </svg>
                </span>
              </button>
              <div v-if="openAlbumId === album.id" class="artist__album-body">
                <div v-if="albumTracksLoading[album.id]" class="artist__loading">
                  <Spinner :size="16" /> Открываем альбом…
                </div>
                <template v-else-if="albumTracks[album.id]?.length">
                  <div class="artist__album-actions">
                    <button class="btn btn--ghost" @click="playAlbum(album)">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                      Слушать весь альбом
                    </button>
                  </div>
                  <TrackList :tracks="albumTracks[album.id]" show-index />
                </template>
                <div v-else class="artist__warn">Пусто</div>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div v-if="similarLoading" class="artist__loading"><Spinner :size="16" /> Подбираем похожее…</div>
          <TrackList
            v-else
            :tracks="similar"
            show-index
            empty-title="Похожих треков не нашлось"
          />
        </template>
      </template>
    </section>
  </ScrollArea>
</template>

<style scoped>
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
.artist__albums {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.artist__album {
  background: var(--bg-2);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
}
.artist__album--open {
  background: var(--bg-3);
}
.artist__album-head {
  display: grid;
  grid-template-columns: 56px 1fr auto;
  gap: 14px;
  align-items: center;
  padding: 10px 14px;
  width: 100%;
  text-align: left;
  color: var(--text-0);
  background: transparent;
  border: none;
  cursor: pointer;
}
.artist__album-head:hover {
  background: var(--bg-3);
}
.artist__album-cover {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  font-weight: 700;
}
.artist__album-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.artist__album-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.artist__album-title {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist__album-sub {
  font-size: 12px;
  color: var(--text-2);
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.artist__album-caret {
  color: var(--text-2);
}
.artist__album-body {
  padding: 8px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.artist__album-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
