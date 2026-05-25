<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, APIError } from "@/api/client";
import type { Artist, ArtistAlbum, Track } from "@/api/types";
import { usePlayerStore } from "@/stores/player";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import { tracksLabel } from "@/composables/useFormat";

const props = defineProps<{ id: string }>();
const router = useRouter();
const player = usePlayerStore();

const artist = ref<Artist | null>(null);
const tracks = ref<Track[]>([]);
const albums = ref<ArtistAlbum[]>([]);
const similar = ref<Track[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  artist.value = null;
  tracks.value = [];
  albums.value = [];
  similar.value = [];
  try {
    const [info, list, albumList] = await Promise.all([
      api.artist(props.id),
      api.byArtist(props.id, { count: 100 }),
      api.artistAlbums(props.id),
    ]);
    artist.value = info;
    tracks.value = list.items;
    albums.value = albumList.items;
    if (list.items.length) {
      const first = list.items.find((t) => !!t.url) ?? list.items[0];
      const sim = await api.recommendations({
        target_audio: `${first.owner_id}_${first.id}`,
        count: 30,
      });
      similar.value = sim.items.filter(
        (t) => !tracks.value.some((tt) => tt.id === t.id && tt.owner_id === t.owner_id)
      );
    }
  } catch (err) {
    error.value =
      err instanceof APIError ? err.detail.message || "Не удалось" : (err as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.id, load);

function playAll() {
  if (tracks.value.length) player.playQueue(tracks.value);
}

async function playAlbum(album: ArtistAlbum) {
  const list = await api.playlist({
    owner_id: album.owner_id,
    playlist_id: album.id,
    access_key: album.access_key,
    count: 100,
  });
  if (list.items.length) player.playQueue(list.items);
}
</script>

<template>
  <ScrollArea>
    <section
      class="artist__hero"
      :style="artist?.photo ? { backgroundImage: `linear-gradient(180deg, rgba(8,9,14,0.15), rgba(8,9,14,0.7)), url(${artist.photo})` } : undefined"
    >
      <div class="artist__hero-inner">
        <div class="artist__eyebrow">Артист</div>
        <h1 class="artist__name">{{ artist?.name ?? "Загрузка…" }}</h1>
        <div class="artist__meta">
          <span v-if="tracks.length">{{ tracksLabel(tracks.length) }}</span>
          <span v-if="artist?.is_followed" class="chip chip--active">Подписка</span>
        </div>
        <div class="artist__actions">
          <button class="btn btn--primary" :disabled="!tracks.length" @click="playAll">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            Слушать
          </button>
          <button class="btn btn--ghost" @click="router.back()">Назад</button>
        </div>
      </div>
    </section>

    <template v-if="albums.length">
      <PageHeader eyebrow="Релизы" title="Альбомы и синглы" />
      <section class="artist__albums">
        <button
          v-for="album in albums"
          :key="`${album.owner_id}_${album.id}`"
          class="artist__album hover-lift"
          @click="playAlbum(album)"
        >
          <div
            class="artist__album-cover"
            :style="album.cover ? { backgroundImage: `url(${album.cover})` } : undefined"
          >
            <span v-if="!album.cover" class="artist__album-fallback accent-gradient" />
          </div>
          <div class="artist__album-title" :title="album.title">{{ album.title }}</div>
          <div class="artist__album-meta">
            <span v-if="album.year">{{ album.year }}</span>
            <span v-if="album.track_count">{{ album.track_count }} треков</span>
          </div>
        </button>
      </section>
    </template>

    <PageHeader eyebrow="Треки" title="Все треки" />
    <section class="artist__body">
      <div v-if="loading" class="artist__loading"><Spinner :size="20" /> Загружаем артиста…</div>
      <div v-else-if="error" class="artist__error">{{ error }}</div>
      <TrackList
        v-else
        :tracks="tracks"
        show-index
        empty-title="У артиста пока нет треков"
      />
    </section>

    <template v-if="similar.length">
      <PageHeader eyebrow="Похожие" title="С чем послушать дальше" />
      <section class="artist__body">
        <TrackList :tracks="similar.slice(0, 12)" show-index />
      </section>
    </template>
  </ScrollArea>
</template>

<style scoped>
.artist__hero {
  position: relative;
  margin: 16px 32px 0;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  background-size: cover;
  background-position: center;
  color: #fff;
  overflow: hidden;
  min-height: 240px;
  display: flex;
  align-items: flex-end;
}
.artist__hero-inner {
  padding: 28px 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.artist__eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  opacity: 0.85;
}
.artist__name {
  margin: 0;
  font-size: 38px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}
.artist__meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
}
.artist__actions {
  display: flex;
  gap: 10px;
}
.artist__body {
  padding: 0 32px 24px;
}
.artist__albums {
  padding: 0 32px 24px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 16px;
}
.artist__album {
  text-align: left;
  color: var(--text-0);
  min-width: 0;
}
.artist__album-cover {
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  background-color: var(--bg-3);
  background-size: cover;
  background-position: center;
  overflow: hidden;
  position: relative;
  box-shadow: var(--shadow-sm);
  margin-bottom: 10px;
}
.artist__album-fallback {
  position: absolute;
  inset: 0;
}
.artist__album-title {
  font-weight: 700;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist__album-meta {
  display: flex;
  gap: 6px;
  margin-top: 3px;
  color: var(--text-2);
  font-size: 12px;
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
</style>
