<script setup lang="ts">
import { computed, toRef } from "vue";
import { storeToRefs } from "pinia";
import { usePlayerStore } from "@/stores/player";
import { useExternalArt } from "@/composables/useExternalArt";
import type { Track } from "@/api/types";
import SvgIcon from "./SvgIcon.vue";

const props = defineProps<{
  track: Track;
}>();

const emit = defineEmits<{
  (e: "play"): void;
}>();

const player = usePlayerStore();

const { current, isPlaying } = storeToRefs(player);

const isCurrent = computed(
  () => current.value?.id === props.track.id && current.value?.owner_id === props.track.owner_id
);

function playOne() {
  if (!props.track.url) return;
  emit("play");
}

const hasVkCover = computed(() => !!props.track.cover_small);

const trackArtist = computed(() => props.track.main_artists?.[0]?.name || props.track.artist || null);
const trackTitle = computed(() => props.track.title || null);
const { cover: externalCover } = useExternalArt(
  trackArtist,
  trackTitle,
  toRef(() => hasVkCover.value)
);
const displayCover = computed(() => props.track.cover_small || externalCover.value || null);
</script>

<template>
  <button
    class="slider-track"
    :class="{ 'slider-track--playing': isCurrent, 'slider-track--disabled': !track.url }"
    @click="playOne"
  >
    <div class="slider-track__cover-wrap">
      <div class="slider-track__cover" v-lazy-bg="displayCover">
        <span v-if="!displayCover" class="slider-track__fallback accent-gradient" />
      </div>
      <div class="slider-track__play-icon">
        <SvgIcon v-if="isCurrent && isPlaying" name="pause" width="16" height="16" />
        <SvgIcon v-else name="play" width="16" height="16" />
      </div>
    </div>

    <div class="slider-track__info">
      <div class="slider-track__title" :title="track.title">
        {{ track.title }}
        <span v-if="track.subtitle" class="slider-track__subtitle">{{ track.subtitle }}</span>
        <span v-if="track.is_explicit" class="slider-track__explicit">E</span>
      </div>
      <div class="slider-track__artist" :title="track.artist">
        {{ trackArtist }}
      </div>
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
  width: 48px;
  height: 48px;
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
  overflow: hidden;
  text-overflow: ellipsis;
}
.slider-track--playing .slider-track__title {
  color: var(--accent-text, var(--primary));
}
.slider-track__subtitle {
  color: var(--text-2);
  margin-left: 4px;
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
}
.slider-track__artist {
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
