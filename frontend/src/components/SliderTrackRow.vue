<script setup lang="ts">
import { computed, toRef } from "vue";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
import { useExternalArt } from "@/composables/useExternalArt";
import { useRouter } from "vue-router";
import type { Track } from "@/api/types";
import SvgIcon from "./SvgIcon.vue";

const props = defineProps<{
  track: Track;
}>();

const emit = defineEmits<{
  (e: "play"): void;
}>();

const player = usePlayerStore();
const ui = useUIStore();
const router = useRouter();

const isCurrent = computed(
  () => player.current?.id === props.track.id && player.current?.owner_id === props.track.owner_id
);

const unavailable = computed(() => !props.track.url);

function playOne() {
  if (unavailable.value) {
    ui.notify("Трек недоступен", "error");
    return;
  }
  emit("play");
}

const trackKey = computed(() => `${props.track.owner_id}_${props.track.id}`);

const hasVkCover = computed(() => !!props.track.cover_small);

const trackArtist = computed(() => props.track.main_artists?.[0]?.name || props.track.artist || null);
const trackTitle = computed(() => props.track.title || null);
const { cover: externalCover } = useExternalArt(
  trackArtist,
  trackTitle,
  toRef(() => hasVkCover.value)
);
const displayCover = computed(() => props.track.cover_small || externalCover.value || null);

function goToArtist() {
  const artistId = props.track.main_artists?.[0]?.id;
  const artistName = props.track.main_artists?.[0]?.name || props.track.artist;
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
</script>

<template>
  <button
    class="slider-track"
    :class="{ 'slider-track--playing': isCurrent, 'slider-track--disabled': unavailable }"
    @dblclick="playOne"
    @contextmenu.prevent.stop="ui.showTrackContextMenu($event, track, 'full')"
    @mouseenter="ui.hoveredTrackKey = trackKey"
    @mouseleave="ui.hoveredTrackKey === trackKey ? ui.hoveredTrackKey = null : null"
  >
    <div class="slider-track__cover-wrap" @click.stop="isCurrent ? player.togglePlay() : playOne()">
      <div class="slider-track__cover" v-lazy-bg="displayCover">
        <span v-if="!displayCover" class="slider-track__fallback accent-gradient" />
      </div>
      <div class="slider-track__play-icon">
        <SvgIcon v-if="isCurrent && player.isPlaying" name="pause" width="16" height="16" />
        <SvgIcon v-else name="play" width="16" height="16" />
      </div>
    </div>

    <div class="slider-track__info">
      <div class="slider-track__title" :title="track.title + (track.subtitle ? ' (' + track.subtitle + ')' : '')">
        <span class="slider-track__title-text">{{ track.title }}</span>
        <span v-if="track.subtitle" class="slider-track__subtitle">{{ track.subtitle }}</span>
        <span v-if="track.is_explicit" class="slider-track__explicit">E</span>
      </div>
      <div class="slider-track__artist" :title="track.artist" @click.stop="goToArtist">
        {{ trackArtist }}
      </div>
    </div>

    <div class="slider-track__actions">
      <button
        class="slider-track__action"
        title="Ещё"
        aria-label="Меню"
        @dblclick.stop
        @click.stop="ui.showTrackContextMenu($event, track, 'full')"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
        </svg>
      </button>
    </div>
  </button>
</template>

<style scoped>
.slider-track {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px;
  border-radius: var(--radius-md);
  background: transparent;
  border: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
  outline: none;
}
.slider-track:hover {
  background: var(--bg-2);
}
.slider-track--playing {
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent-1) 12%, transparent), color-mix(in srgb, var(--accent-3) 12%, transparent));
}
.slider-track--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.slider-track__cover-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}
.slider-track__cover {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-color: var(--bg-3);
}
.slider-track__fallback {
  display: block;
  width: 100%;
  height: 100%;
}
.slider-track__play-icon {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s;
}
.slider-track:hover .slider-track__play-icon,
.slider-track--playing .slider-track__play-icon {
  opacity: 1;
}

.slider-track__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}
.slider-track__title {
  font-size: calc(14px * var(--font-scale, 1));
  font-weight: 500;
  color: var(--text-0);
  white-space: nowrap;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.slider-track--playing .slider-track__title {
  color: var(--accent-text, var(--primary));
}
.slider-track__title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
}
.slider-track__subtitle {
  color: var(--text-2);
  margin-left: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 2;
}
.slider-track__explicit {
  display: inline-block;
  font-size: 9px;
  font-weight: 700;
  border: 1px solid var(--text-2);
  border-radius: 3px;
  padding: 0 3px;
  margin-left: 6px;
  color: var(--text-2);
  transform: translateY(-1px);
  flex-shrink: 0;
}
.slider-track__artist {
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: color 0.15s ease;
}
.slider-track__artist:hover {
  color: var(--text-0);
}

.slider-track__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--motion-duration-base) var(--motion-ease-out);
}
.slider-track:hover .slider-track__actions {
  opacity: 1;
}
.slider-track__action {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background var(--motion-duration-base) var(--motion-ease-out),
              color var(--motion-duration-base) var(--motion-ease-out),
              transform var(--motion-duration-base) var(--motion-ease-out);
}
.slider-track__action:hover {
  background: var(--bg-3);
  color: var(--text-0);
  transform: scale(var(--motion-scale-hover));
}
</style>
