<script setup lang="ts">
import { computed, toRef } from "vue";
import { useRouter } from "vue-router";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { useUIStore } from "@/stores/ui";
import { useExternalArt } from "@/composables/useExternalArt";
import { formatDuration } from "@/composables/useFormat";
import type { Track } from "@/api/types";

const props = defineProps<{
  track: Track;
  index: number;
  current: boolean;
  playing: boolean;
}>();

const emit = defineEmits<{
  play: [index: number];
  remove: [index: number];
}>();

const player = usePlayerStore();
const library = useLibraryStore();
const ui = useUIStore();
const router = useRouter();

const inLibrary = computed(() => library.isInLibrary(props.track));

async function toggleLibrary() {
  try {
    if (inLibrary.value) {
      await library.removeFromLibrary(props.track);
      ui.notify("Удалено из библиотеки", "success");
    } else {
      await library.addToLibrary(props.track);
      ui.notify("Добавлено в библиотеку", "success");
    }
  } catch (err) {
    ui.notify((err as Error).message || "Не удалось", "error");
  }
}

const trackArtist = computed(() => props.track.main_artists[0]?.name || props.track.artist || null);
const trackTitle = computed(() => props.track.title || null);
const hasVkCover = computed(() => !!props.track.album_cover);
const { cover: externalCover } = useExternalArt(
  trackArtist,
  trackTitle,
  toRef(() => hasVkCover.value)
);
const displayCover = computed(() => props.track.album_cover || externalCover.value || null);

function gotoSpecificArtist(artistId?: string | null, artistName?: string | null) {
  if (artistId) {
    router.push({
      name: "artist",
      params: { id: artistId },
      query: artistName ? { name: artistName } : undefined,
    });
  } else if (artistName) {
    router.push({ name: "search", query: { q: artistName } });
  }
}

function uncensored() {
  const main = props.track.main_artists[0];
  const q = `${main?.name || props.track.artist} ${props.track.title}`.trim();
  if (q) router.push({ name: "search", query: { q, mode: "any" } });
}

function similar() {
  router.push({
    name: "similar",
    params: { audioId: `${props.track.owner_id}_${props.track.id}` },
    query: {
      artist: props.track.artist || undefined,
      title: props.track.title || undefined,
    },
  });
}

function addToQueue() {
  if (!props.track.url) {
    ui.notify("Трек недоступен", "error");
    return;
  }
  player.enqueueNext(props.track);
  ui.notify("Трек будет играть следующим", "success");
}
</script>

<template>
  <li
    class="queue__row"
    :class="{
      'queue__row--current': current,
      'queue__row--playing': current && playing,
    }"
  >
    <span class="queue__handle" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <circle cx="8" cy="6" r="1.6" /><circle cx="8" cy="12" r="1.6" /><circle cx="8" cy="18" r="1.6" />
        <circle cx="16" cy="6" r="1.6" /><circle cx="16" cy="12" r="1.6" /><circle cx="16" cy="18" r="1.6" />
      </svg>
    </span>
    <span class="queue__index">
      <template v-if="current">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </template>
      <template v-else>{{ index + 1 }}</template>
    </span>
    <div
      class="queue__cover"
      v-lazy-bg="displayCover"
    >
      <span v-if="!displayCover" class="queue__cover-stub">{{ track.title.charAt(0) }}</span>
    </div>
    <div class="queue__meta">
      <div class="queue__title" :title="track.title">{{ track.title }}</div>
      <div class="queue__artist-wrap" :title="track.artist">
        <template v-if="track.main_artists?.length">
          <template v-for="(artist, idx) in track.main_artists" :key="artist.id || artist.name">
            <button class="queue__artist" @click.stop="gotoSpecificArtist(artist.id, artist.name)">{{ artist.name }}</button><span v-if="idx < track.main_artists.length - 1" class="queue__artist-comma">, </span>
          </template>
        </template>
        <template v-else>
          <button class="queue__artist" @click.stop="gotoSpecificArtist(undefined, track.artist)">{{ track.artist }}</button>
        </template>
      </div>
    </div>
    <div class="queue__actions">
      <button
        class="queue__action queue__action--lib"
        :class="{ 'queue__action--in-lib': inLibrary }"
        :title="inLibrary ? 'Удалить из библиотеки' : 'В библиотеку'"
        @click.stop="toggleLibrary"
      >
        <svg v-if="!inLibrary" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <template v-else>
          <svg class="queue__lib-check" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M9 16.2 5.5 12.7 4 14.2 9 19.2 20 8.2 18.5 6.7z" />
          </svg>
          <svg class="queue__lib-x" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </template>
      </button>
      <button class="queue__action" title="Без цензуры" aria-label="Без цензуры" @click.stop="uncensored">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
      </button>
      <button class="queue__action" title="Похожие" aria-label="Похожие" @click.stop="similar">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        </svg>
      </button>
      <button class="queue__action" title="Слушать далее" aria-label="Слушать далее" @click.stop="addToQueue">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="15" y2="6" />
          <line x1="3" y1="12" x2="15" y2="12" />
          <line x1="3" y1="18" x2="11" y2="18" />
          <line x1="19" y1="9" x2="19" y2="19" />
          <line x1="14" y1="14" x2="24" y2="14" />
        </svg>
      </button>
    </div>
    <span class="queue__duration">{{ formatDuration(track.duration) }}</span>
    <button
      class="queue__remove"
      title="Удалить из очереди"
      aria-label="Удалить из очереди"
      @click.stop="emit('remove', index)"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  </li>
</template>

<style scoped>
.queue__action--lib {
  position: relative;
}
.queue__action--in-lib {
  color: var(--accent-1);
}
.queue__action--in-lib .queue__lib-x {
  display: none;
  position: absolute;
  inset: 0;
  margin: auto;
  color: var(--danger);
}
.queue__action--in-lib:hover .queue__lib-x {
  display: block;
}
.queue__action--in-lib:hover .queue__lib-check {
  display: none;
}
.queue__action--in-lib:hover {
  background: rgba(255, 94, 126, 0.12);
}
</style>
