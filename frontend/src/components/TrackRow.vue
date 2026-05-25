<script setup lang="ts">
import { computed, toRef } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { useUIStore } from "@/stores/ui";
import { useMotion } from "@/composables/useSpring";
import { useExternalArt } from "@/composables/useExternalArt";
import { formatDuration } from "@/composables/useFormat";
import type { Track } from "@/api/types";

const props = defineProps<{
  track: Track;
  index?: number;
  showIndex?: boolean;
  variant?: "default" | "compact";
}>();

const player = usePlayerStore();
const library = useLibraryStore();
const ui = useUIStore();
const router = useRouter();
const motion = useMotion();

const { current, isPlaying } = storeToRefs(player);

const isCurrent = computed(
  () => current.value?.id === props.track.id && current.value?.owner_id === props.track.owner_id
);
const inLibrary = computed(() => library.isInLibrary(props.track));
const unavailable = computed(() => !props.track.url);

const motionVariants = computed(() =>
  motion.spring({ opacity: 0, y: 6 }, { opacity: 1, y: 0 }, { stiffness: 260, damping: 24 })
);

function playOne() {
  if (unavailable.value) {
    ui.notify("Трек недоступен", "error");
    return;
  }
  player.playTrack(props.track);
}

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
  // VK doesn't expose every credited performer as an artist entity — fall
  // back to a search query so non-clickable names still drill into music.
  const name = main?.name || props.track.artist;
  if (name) router.push({ name: "search", query: { q: name } });
}

function uncensoredSearch() {
  const main = props.track.main_artists[0];
  const q = `${main?.name || props.track.artist} ${props.track.title}`.trim();
  if (q) router.push({ name: "search", query: { q, mode: "any" } });
}

function openSimilar() {
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
  if (unavailable.value) {
    ui.notify("Трек недоступен", "error");
    return;
  }
  player.appendToQueue(props.track);
  ui.notify("Добавлено в очередь", "success");
}

// Cover fallback (iTunes) only when VK doesn't ship a cover and the user
// hasn't disabled the setting. Composable returns `null` otherwise.
const trackArtist = computed(() => props.track.main_artists[0]?.name || props.track.artist || null);
const trackTitle = computed(() => props.track.title || null);
const hasVkCover = computed(() => !!props.track.album_cover);
const { cover: externalCover } = useExternalArt(
  trackArtist,
  trackTitle,
  toRef(() => hasVkCover.value)
);
const displayCover = computed(() => props.track.album_cover || externalCover.value || null);

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
</script>

<template>
  <div
    v-motion="motionVariants"
    class="row"
    :class="{ 'row--playing': isCurrent, 'row--compact': variant === 'compact', 'row--off': unavailable }"
    @dblclick="playOne"
  >
    <div class="row__lead">
      <span v-if="showIndex && !isCurrent" class="row__index">{{ (index ?? 0) + 1 }}</span>
      <button
        v-else
        class="row__play"
        :aria-label="isCurrent && isPlaying ? 'Пауза' : 'Воспроизвести'"
        @click.stop="isCurrent ? player.togglePlay() : playOne()"
      >
        <svg v-if="isCurrent && isPlaying" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
          <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
      </button>
    </div>

    <div class="row__cover" :style="displayCover ? { backgroundImage: `url(${displayCover})` } : undefined">
      <span v-if="!displayCover" class="row__cover-fallback accent-gradient" />
    </div>

    <div class="row__main">
      <div class="row__title" :title="track.title">
        {{ track.title }}
        <span v-if="track.is_explicit" class="row__explicit" title="Explicit">E</span>
      </div>
      <button class="row__artist" @click.stop="gotoArtist">{{ track.artist }}</button>
    </div>

    <div class="row__actions">
      <button
        class="row__action row__action--lib"
        :class="{ 'row__action--in-lib': inLibrary }"
        :title="inLibrary ? 'Удалить из библиотеки' : 'В библиотеку'"
        @click.stop="toggleLibrary"
      >
        <svg v-if="!inLibrary" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <template v-else>
          <svg class="row__lib-check" viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M9 16.2 5.5 12.7 4 14.2 9 19.2 20 8.2 18.5 6.7z" />
          </svg>
          <svg class="row__lib-x" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </template>
      </button>
      <button class="row__action" title="Без цензуры" aria-label="Без цензуры" @click.stop="uncensoredSearch">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <line x1="20" y1="4" x2="8.12" y2="15.88" />
          <line x1="14.47" y1="14.48" x2="20" y2="20" />
          <line x1="8.12" y1="8.12" x2="12" y2="12" />
        </svg>
      </button>
      <button class="row__action" title="Похожие" aria-label="Похожие" @click.stop="openSimilar">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          <path d="M5 5l2.5 2.5M16.5 16.5 19 19M19 5l-2.5 2.5M7.5 16.5 5 19" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <button class="row__action" title="В очередь" aria-label="Добавить в очередь" @click.stop="addToQueue">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="3" y1="6" x2="15" y2="6" />
          <line x1="3" y1="12" x2="15" y2="12" />
          <line x1="3" y1="18" x2="11" y2="18" />
          <line x1="19" y1="9" x2="19" y2="19" />
          <line x1="14" y1="14" x2="24" y2="14" />
        </svg>
      </button>
    </div>

    <div class="row__duration">{{ formatDuration(track.duration) }}</div>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 32px 48px minmax(0, 1fr) auto 56px;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  transition:
    background var(--motion-duration-fast) var(--motion-ease-out),
    transform var(--motion-duration-fast) var(--motion-ease-out);
}
.row:hover {
  background: var(--bg-2);
}
.row--playing {
  background: linear-gradient(90deg, rgba(26, 140, 255, 0.12), rgba(109, 60, 255, 0.12));
  color: var(--text-0);
}
.row--off {
  opacity: 0.55;
}
.row--compact {
  grid-template-columns: 32px 40px minmax(0, 1fr) 56px;
  gap: 12px;
  padding: 6px 10px;
}
.row--compact .row__actions {
  display: none;
}
.row__lead {
  display: flex;
  align-items: center;
  justify-content: center;
}
.row__index {
  font-variant-numeric: tabular-nums;
  color: var(--text-3);
  font-size: 13px;
}
.row:hover .row__index {
  display: none;
}
.row__play {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-0);
  background: var(--bg-3);
  opacity: 0;
}
.row:hover .row__play,
.row--playing .row__play {
  opacity: 1;
}
.row--playing .row__play {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: white;
}
.row__cover {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background-color: var(--bg-3);
  background-size: cover;
  background-position: center;
  overflow: hidden;
  flex: 0 0 44px;
  position: relative;
}
.row--compact .row__cover {
  width: 36px;
  height: 36px;
  flex-basis: 36px;
}
.row__cover-fallback {
  position: absolute;
  inset: 0;
}
.row__main {
  min-width: 0;
}
.row__title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 6px;
}
.row__explicit {
  display: inline-block;
  background: var(--bg-3);
  color: var(--text-1);
  padding: 0 5px;
  font-size: 9px;
  border-radius: 3px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.row__artist {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-2);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  max-width: 100%;
}
.row__artist:hover {
  color: var(--text-0);
}
.row__actions {
  display: inline-flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--motion-duration-fast) var(--motion-ease-out);
}
.row:hover .row__actions {
  opacity: 1;
}
.row__action {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
}
.row__action:hover {
  background: var(--bg-3);
  color: var(--text-0);
}
.row__action--lib {
  position: relative;
}
.row__action--in-lib {
  color: var(--accent-1);
}
.row__action--in-lib .row__lib-x {
  display: none;
  position: absolute;
  inset: 0;
  margin: auto;
  color: var(--danger);
}
.row__action--in-lib:hover .row__lib-x {
  display: block;
}
.row__action--in-lib:hover .row__lib-check {
  display: none;
}
.row__action--in-lib:hover {
  background: rgba(255, 94, 126, 0.12);
}
.row__duration {
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  font-size: 12px;
  text-align: right;
}
</style>
