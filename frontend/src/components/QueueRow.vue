<script setup lang="ts">
import { computed, toRef } from "vue";
import { useRouter } from "vue-router";
import { usePlayerStore } from "@/stores/player";
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
const ui = useUIStore();
const router = useRouter();

const trackArtist = computed(() => props.track.main_artists[0]?.name || props.track.artist || null);
const trackTitle = computed(() => props.track.title || null);
const hasVkCover = computed(() => !!props.track.album_cover);
const { cover: externalCover } = useExternalArt(
  trackArtist,
  trackTitle,
  toRef(() => hasVkCover.value)
);
const displayCover = computed(() => props.track.album_cover || externalCover.value || null);

function gotoArtist() {
  const main = props.track.main_artists[0];
  if (main?.id) {
    router.push({
      name: "artist",
      params: { id: main.id },
      query: main.name ? { name: main.name } : undefined,
    });
    return;
  }
  const name = main?.name || props.track.artist;
  if (name) router.push({ name: "search", query: { q: name } });
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
  player.appendToQueue(props.track);
  ui.notify("Добавлено в очередь", "success");
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
    <button
      class="queue__cover"
      :title="`Играть «${track.title}»`"
      :style="displayCover ? { backgroundImage: `url(${displayCover})` } : undefined"
      @click="emit('play', index)"
    >
      <span v-if="!displayCover" class="queue__cover-stub">{{ track.title.charAt(0) }}</span>
    </button>
    <div class="queue__meta">
      <button class="queue__title" @click="emit('play', index)">{{ track.title }}</button>
      <button class="queue__artist" @click.stop="gotoArtist">{{ track.artist }}</button>
    </div>
    <div class="queue__actions">
      <button class="queue__action" title="Без цензуры" aria-label="Без цензуры" @click.stop="uncensored">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
      </button>
      <button class="queue__action" title="Похожие" aria-label="Похожие" @click.stop="similar">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          <path d="M5 5l2.5 2.5M16.5 16.5 19 19M19 5l-2.5 2.5M7.5 16.5 5 19" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <button class="queue__action" title="В очередь" aria-label="Добавить в очередь" @click.stop="addToQueue">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  </li>
</template>
