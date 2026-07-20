<script setup lang="ts">
import { computed, ref } from "vue";
import type { AlbumSummary, Track } from "@/api/types";
import SliderTrackRow from "./SliderTrackRow.vue";
import SvgIcon from "./SvgIcon.vue";
import Spinner from "./Spinner.vue";
import { useUIStore } from "@/stores/ui";

const props = defineProps<{
  block: AlbumSummary;
  loading?: boolean;
}>();

const emit = defineEmits<{
  open: [block: AlbumSummary],
  playTrack: [track: Track, index: number],
  play: [block: AlbumSummary],
  add: [block: AlbumSummary],
  share: [block: AlbumSummary]
}>();

const ui = useUIStore();
const isAdded = ref(false);

const background = computed(() => {
  if (props.block.cover) {
    return `linear-gradient(180deg, rgba(8, 9, 14, 0.4), rgba(8, 9, 14, 0.0) 50%), url(${props.block.cover}) center/cover`;
  }
  return "linear-gradient(135deg, var(--accent-1), var(--accent-3))";
});

function onAddClick() {
  isAdded.value = !isAdded.value;
  if (isAdded.value) {
    ui.notify("Плейлист добавлен в мою музыку", "success");
  } else {
    ui.notify("Плейлист удален из моей музыки", "success");
  }
  emit("add", props.block);
}

function onPlayClick() {
  emit("play", props.block);
}

function onShareClick() {
  emit("share", props.block);
}
</script>

<template>
  <div class="large-playlist-card">
    <div class="lpc-header" :style="{ background }" @click="emit('open', block)">
      <div class="lpc-header__overlay"></div>
      
      <div class="lpc-header__actions">
        <button class="lpc-action-btn" title="Добавить в мою музыку" @click.stop="onAddClick">
          <SvgIcon :name="isAdded ? 'check' : 'plus'" width="18" height="18" />
        </button>
        <button class="lpc-action-btn lpc-action-btn--play" title="Воспроизвести" :class="{ 'lpc-action-btn--loading': loading }" @click.stop="onPlayClick">
          <Spinner v-if="loading" :size="20" color="#000" />
          <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
        <button class="lpc-action-btn" title="Поделиться" @click.stop="onShareClick">
          <SvgIcon name="share" width="18" height="18" />
        </button>
      </div>

      <div class="lpc-header__content">
        <div class="lpc-header__top">
          <div v-if="block.subtitle" class="lpc-header__subtitle">{{ block.subtitle }}</div>
          <div class="lpc-header__title">{{ block.title }}</div>
        </div>
        <div class="lpc-header__bottom">
          <div v-if="block.owner_name" class="lpc-header__owner">
            <img v-if="block.owner_photo" :src="block.owner_photo" class="lpc-header__owner-avatar" alt="Avatar" />
            <span class="lpc-header__owner-name">{{ block.owner_name }}</span>
          </div>
          <div class="lpc-header__play-wrapper" v-if="loading">
            <Spinner :size="24" color="#fff" />
          </div>
        </div>
      </div>
    </div>
    <div class="lpc-tracks" v-if="block.tracks && block.tracks.length > 0">
      <SliderTrackRow
        v-for="(track, index) in block.tracks"
        :key="track.id"
        :track="track"
        @play="emit('playTrack', track, index)"
      />
    </div>
  </div>
</template>

<style scoped>
.large-playlist-card {
  width: min-content;
  min-width: 270px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.lpc-header {
  position: relative;
  width: 100%;
  height: 120px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  transition: transform 0.2s ease;
}
.lpc-header:hover {
  transform: scale(0.98);
}
.lpc-header__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 100%);
  z-index: 1;
  transition: background 0.2s ease;
}
.lpc-header:hover .lpc-header__overlay {
  background: rgba(8, 9, 14, 0.65);
}
.lpc-header__content {
  position: relative;
  z-index: 2;
  padding: 16px;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: opacity 0.2s ease;
  min-width: 0;
}
.lpc-header:hover .lpc-header__content {
  opacity: 0.15;
}
.lpc-header__actions {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  opacity: 0;
  z-index: 3;
  transition: opacity 0.2s ease;
  pointer-events: none;
}
.lpc-header:hover .lpc-header__actions {
  opacity: 1;
  pointer-events: auto;
}
.lpc-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
}
.lpc-action-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.08);
}
.lpc-action-btn--play {
  width: 48px;
  height: 48px;
  background: #fff;
  border: none;
  color: #000;
}
.lpc-action-btn--play:hover {
  background: #f0f0f0;
  color: #000;
}
.lpc-action-btn--loading {
  background: rgba(255, 255, 255, 0.15);
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  cursor: default;
}
.lpc-header__top {
  display: flex;
  flex-direction: column;
  min-width: 0;
  width: 100%;
}
.lpc-header__subtitle {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 4px;
  white-space: nowrap;
}
.lpc-header__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.lpc-header__bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.lpc-header__owner {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}
.lpc-header__owner-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.4);
  flex-shrink: 0;
}
.lpc-header__owner-name {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.95;
  min-width: 0;
}
.lpc-header__play-wrapper {
  display: flex;
  flex-shrink: 0;
}
.lpc-tracks {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  min-width: 0;
}
</style>
