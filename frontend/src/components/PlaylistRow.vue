<script setup lang="ts">
import { computed } from "vue";
import type { AlbumSummary } from "@/api/types";
import SvgIcon from "./SvgIcon.vue";

const props = defineProps<{
  playlist: AlbumSummary;
}>();

const emit = defineEmits<{
  play: [playlist: AlbumSummary];
  delete: [playlist: AlbumSummary];
}>();

const coverImage = computed(() => props.playlist.cover || null);
const subtitleText = computed(() => {
  const parts = [];
  if (props.playlist.track_count != null) {
    const count = props.playlist.track_count;
    let label = "треков";
    if (count % 10 === 1 && count % 100 !== 11) label = "трек";
    else if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20)) label = "трека";
    parts.push(`${count} ${label}`);
  }
  if (props.playlist.year) {
    parts.push(String(props.playlist.year));
  }
  return parts.join(" · ") || props.playlist.subtitle || "Плейлист";
});
</script>

<template>
  <div
    class="playlist-row"
    @click="emit('play', playlist)"
    @contextmenu.prevent
  >
    <div class="playlist-row__cover-wrap">
      <div class="playlist-row__cover" v-lazy-bg="coverImage">
        <span v-if="!coverImage" class="playlist-row__fallback accent-gradient" />
      </div>
      <div class="playlist-row__play-overlay">
        <SvgIcon name="play" width="16" height="16" />
      </div>
    </div>

    <div class="playlist-row__info">
      <div class="playlist-row__title" :title="playlist.title">
        {{ playlist.title }}
      </div>
      <div class="playlist-row__subtitle" :title="subtitleText">
        {{ subtitleText }}
      </div>
    </div>

    <div class="playlist-row__actions">
      <button
        class="playlist-row__action"
        title="Удалить из моей музыки"
        @click.stop="emit('delete', playlist)"
      >
        <SvgIcon name="cross" width="16" height="16" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.playlist-row {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 10px 14px;
  border-radius: var(--radius-lg, 12px);
  cursor: pointer;
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
  user-select: none;
}

.playlist-row:hover {
  background: var(--bg-2);
}

.playlist-row__cover-wrap {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: 12px;
  overflow: hidden;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.playlist-row:hover .playlist-row__cover-wrap {
  transform: scale(1.04);
}

.playlist-row__cover {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-color: var(--bg-3);
}

.playlist-row__fallback {
  display: block;
  width: 100%;
  height: 100%;
}

.playlist-row__play-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity 0.2s ease;
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.playlist-row:hover .playlist-row__play-overlay {
  opacity: 1;
}

.playlist-row__info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  flex: 1;
}

.playlist-row__title {
  font-size: calc(16px * var(--font-scale, 1));
  font-weight: 700;
  color: var(--text-primary, var(--text-0));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-row__subtitle {
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 4px;
}

.playlist-row__actions {
  opacity: 0;
  transition: opacity var(--motion-duration-fast) var(--motion-ease-out);
  flex-shrink: 0;
}

.playlist-row:hover .playlist-row__actions {
  opacity: 1;
}

.playlist-row__action {
  width: 36px;
  height: 36px;
  border-radius: 50%;
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

.playlist-row__action:hover {
  background: var(--bg-3);
  color: var(--danger, #ff4d4f);
  transform: scale(var(--motion-scale-hover));
}
</style>
