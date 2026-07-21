<script setup lang="ts">
import { computed, toRef } from "vue";
import { useRouter } from "vue-router";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { useUIStore } from "@/stores/ui";
import { useSettingsStore } from "@/stores/settings";
import { useExternalArt } from "@/composables/useExternalArt";
import { formatDuration } from "@/composables/useFormat";
import type { Track } from "@/api/types";
import SvgIcon from "./SvgIcon.vue";

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
const settings = useSettingsStore();
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
const hasVkCover = computed(() => !!props.track.cover_small);

const { cover: externalCover } = useExternalArt(
  trackArtist,
  trackTitle,
  toRef(() => hasVkCover.value)
);

const displayCover = computed(() => props.track.cover_small || externalCover.value || null);

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

function shareTrack() {
  ui.activeShareTrack = props.track;
  ui.shareModalOpen = true;
}

const trackItems = computed(() => {
  return settings.trackItems.filter((item) => item.visible);
});
const trackKey = computed(() => `${props.track.owner_id}_${props.track.id}`);
</script>

<template>
  <li
    class="queue__row"
    :class="{
      'queue__row--current': current,
      'queue__row--playing': current && playing,
    }"
    @contextmenu.prevent.stop="ui.showTrackContextMenu($event, track, 'edit_only')"
    @mouseenter="ui.hoveredTrackKey = trackKey"
    @mouseleave="ui.hoveredTrackKey === trackKey ? ui.hoveredTrackKey = null : null"
  >
    <span class="queue__handle" aria-hidden="true">
      <template v-if="settings.dragHandleStyle === 'lines'">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/>
        </svg>
      </template>
      <template v-else-if="settings.dragHandleStyle === 'grip'">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <circle cx="5" cy="9" r="2" /><circle cx="12" cy="9" r="2" /><circle cx="19" cy="9" r="2" />
          <circle cx="5" cy="15" r="2" /><circle cx="12" cy="15" r="2" /><circle cx="19" cy="15" r="2" />
        </svg>
      </template>
      <template v-else>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <circle cx="9" cy="5" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="9" cy="19" r="2" />
          <circle cx="15" cy="5" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="15" cy="19" r="2" />
        </svg>
      </template>
    </span>
    <span class="queue__index">
      <template v-if="current">
        <SvgIcon name="play" width="14" height="14" />
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
      <template v-for="item in trackItems" :key="item.id">
        <button
          v-if="item.id === 'library'"
          class="queue__action queue__action--lib"
          :class="{ 'queue__action--in-lib': inLibrary }"
          :title="inLibrary ? 'Удалить из библиотеки' : 'В библиотеку'"
          @click.stop="toggleLibrary"
        >
          <SvgIcon v-if="!inLibrary" name="plus" width="18" height="18" />
          <template v-else>
            <SvgIcon name="check" class="queue__lib-check" width="18" height="18" />
            <SvgIcon name="cross" class="queue__lib-x" width="18" height="18" />
          </template>
        </button>
        <button v-else-if="item.id === 'uncensored'" class="queue__action" title="Без цензуры" aria-label="Без цензуры" @click.stop="uncensored">
          <SvgIcon name="uncensored" width="18" height="18" />
        </button>
        <button v-else-if="item.id === 'similar'" class="queue__action" title="Похожие" aria-label="Похожие" @click.stop="similar">
          <SvgIcon name="similar" width="18" height="18" />
        </button>
        <button v-else-if="item.id === 'queue'" class="queue__action" title="Слушать далее" aria-label="Слушать далее" @click.stop="addToQueue">
          <SvgIcon name="queue_add" width="18" height="18" />
        </button>
        <button v-else-if="item.id === 'share'" class="queue__action" title="Поделиться" aria-label="Поделиться" @click.stop="shareTrack">
          <SvgIcon name="share" width="16" height="16" />
        </button>
      </template>
    </div>
    <span class="queue__duration">{{ formatDuration(track.duration) }}</span>
    <button
      class="queue__remove"
      title="Удалить из очереди"
      aria-label="Удалить из очереди"
      @click.stop="emit('remove', index)"
    >
      <SvgIcon name="cross" width="18" height="18" />
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
