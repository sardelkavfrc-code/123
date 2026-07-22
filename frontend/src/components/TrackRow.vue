<script setup lang="ts">
import { computed, toRef } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { useDislikesStore } from "@/stores/dislikes";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useExternalArt } from "@/composables/useExternalArt";
import { formatDuration } from "@/composables/useFormat";
import type { Track } from "@/api/types";
import { api } from "@/api/client";
import SvgIcon from "./SvgIcon.vue";

const props = defineProps<{
  track: Track;
  index?: number;
  showIndex?: boolean;
  variant?: "default" | "compact";
  isSelectMode?: boolean;
  isSelected?: boolean;
}>();

const emit = defineEmits<{
  (e: "play"): void;
  (e: "toggle-select"): void;
  (e: "context-menu-selected", event: MouseEvent): void;
}>();

const player = usePlayerStore();
const library = useLibraryStore();
const dislikes = useDislikesStore();
const ui = useUIStore();
const router = useRouter();
const auth = useAuthStore();

const isMyPlaylistMember = computed(() => {
  return library.activePlaylist && library.activePlaylist.owner_id === auth.status?.user_id;
});

async function removeFromPlaylist() {
  if (!library.activePlaylist) return;
  try {
    await library.removeTrackFromPlaylist(library.activePlaylist, props.track);
    player.removeTrack(props.track);
    ui.notify("Трек удален из плейлиста", "success");
  } catch (err: any) {
    ui.notify(err.message || "Не удалось удалить трек", "error");
  }
}

async function deleteLocalDisk() {
  if (props.track.owner_id !== -999999) return;
  if (!confirm(`Удалить трек ${props.track.title} из базы и с диска?`)) return;
  try {
    await api.deleteLocalTrack(props.track.id, true);
    player.removeTrack(props.track);
    await library.loadLocalTracks();
    ui.notify("Файл удален", "success");
  } catch (err: any) {
    ui.notify(err.message || "Не удалось удалить трек", "error");
  }
}

async function deleteLocalDb() {
  if (props.track.owner_id !== -999999) return;
  if (!confirm(`Скрыть трек ${props.track.title} из медиатеки (оставить файл на диске)?`)) return;
  try {
    await api.deleteLocalTrack(props.track.id, false);
    
    // Add path to ignored paths so it doesn't show up again
    if (props.track.url) {
      try {
        const urlObj = new URL(props.track.url, window.location.origin);
        const path = urlObj.searchParams.get("path");
        if (path && !settings.ignoredPaths.includes(path)) {
          settings.ignoredPaths.push(path);
        }
      } catch {
        const idx = props.track.url.indexOf("path=");
        if (idx >= 0) {
          const path = decodeURIComponent(props.track.url.substring(idx + 5));
          if (path && !settings.ignoredPaths.includes(path)) {
            settings.ignoredPaths.push(path);
          }
        }
      }
    }
    
    player.removeTrack(props.track);
    await library.loadLocalTracks();
    ui.notify("Трек скрыт из списка", "success");
  } catch (err: any) {
    ui.notify(err.message || "Не удалось удалить трек", "error");
  }
}

function handleContextMenu(e: MouseEvent) {
  if (props.isSelectMode && props.isSelected) {
    emit("context-menu-selected", e);
  } else {
    if (settings.trackContextMenuStyle === 'dots') {
      ui.showTrackContextMenu(e, props.track, 'edit_only');
    } else {
      ui.showTrackContextMenu(e, props.track, 'full');
    }
  }
}

function shareTrack() {
  ui.activeShareTrack = props.track;
  ui.shareModalOpen = true;
}

const { current, isPlaying } = storeToRefs(player);

const isCurrent = computed(
  () => current.value?.id === props.track.id && current.value?.owner_id === props.track.owner_id
);
const inLibrary = computed(() => library.isInLibrary(props.track));
const isDisliked = computed(() => dislikes.isDisliked(props.track));

function dislikeTrack() {
  if (isDisliked.value) {
    dislikes.undislike(props.track);
    ui.notify("Дизлайк отменен", "success");
  } else {
    dislikes.dislike(props.track);
    player.removeTrack(props.track);
    ui.notify("Больше не будет попадаться", "success");
  }
}
const unavailable = computed(() => !props.track.url);

function playOne() {
  if (props.isSelectMode) {
    emit("toggle-select");
    return;
  }
  if (unavailable.value) {
    ui.notify("Трек недоступен", "error");
    return;
  }
  emit("play");
}

function handleRowClick() {
  if (props.isSelectMode) {
    emit("toggle-select");
  }
}

function gotoSpecificArtist(artistId?: string | null, artistName?: string | null) {
  if (props.isSelectMode) {
    emit("toggle-select");
    return;
  }
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
  player.enqueueNext(props.track);
  ui.notify("Трек будет играть следующим", "success");
}

const hasVkCover = computed(() => !!props.track.cover_small);

// Cover fallback (iTunes) only when VK doesn't ship a cover and the user
// hasn't disabled the setting. Composable returns `null` otherwise.
const trackArtist = computed(() => props.track.main_artists[0]?.name || props.track.artist || null);
const trackTitle = computed(() => props.track.title || null);
const { cover: externalCover } = useExternalArt(
  trackArtist,
  trackTitle,
  toRef(() => hasVkCover.value)
);
const displayCover = computed(() => props.track.cover_small || externalCover.value || null);

async function toggleLibrary() {
  try {
    if (inLibrary.value) {
      await library.removeFromLibrary(props.track);
    } else {
      await library.addToLibrary(props.track);
      ui.notify("Добавлено в библиотеку", "success");
    }
  } catch (err) {
    ui.notify((err as Error).message || "Не удалось", "error");
  }
}
import { useSettingsStore } from "@/stores/settings";
import { useDownloadStore } from "@/stores/download";

const settings = useSettingsStore();
const downloadStore = useDownloadStore();

const isDownloaded = computed(() => {
  if (props.track.owner_id === -999999) return true;
  const key = `${props.track.artist.toLowerCase()} - ${props.track.title.toLowerCase()}`;
  return library.localTracksMap.has(key);
});

const isDownloading = computed(() => {
  return downloadStore.queue.some(
    item => item.id === props.track.id && item.owner_id === props.track.owner_id && (item.status === 'downloading' || item.status === 'pending')
  );
});

function downloadSingleTrack() {
  void downloadStore.downloadTracks([props.track]);
  ui.notify("Начато скачивание трека", "success");
}

const trackItems = computed(() => {
  return settings.trackItems.filter((item) => item.visible);
});
const trackKey = computed(() => `${props.track.owner_id}_${props.track.id}`);
</script>

<template>
  <div
    class="row"
    :class="{ 'row--playing': isCurrent, 'row--compact': variant === 'compact', 'row--off': unavailable, 'row--selected': isSelected }"
    @click="handleRowClick"
    @dblclick="playOne"
    @contextmenu.prevent.stop="handleContextMenu"
    @mouseenter="ui.hoveredTrackKey = trackKey"
    @mouseleave="ui.hoveredTrackKey === trackKey ? ui.hoveredTrackKey = null : null"
  >
    <div class="row__lead">
      <div v-if="isSelectMode" class="row__checkbox-wrap" @click.stop="emit('toggle-select')">
        <span class="row__checkbox" :class="{ 'row__checkbox--checked': isSelected }">
          <SvgIcon v-if="isSelected" name="check" width="10" height="10" />
        </span>
      </div>
      <template v-else>
        <span v-if="showIndex && !isCurrent" class="row__index">{{ (index ?? 0) + 1 }}</span>
        <button
          v-else
          class="row__play"
          :aria-label="isCurrent && isPlaying ? 'Пауза' : 'Воспроизвести'"
          :title="isCurrent && isPlaying ? 'Пауза' : 'Воспроизвести'"
          @click.stop="isCurrent ? player.togglePlay() : playOne()"
        >
          <SvgIcon v-if="isCurrent && isPlaying" name="pause" width="14" height="14" />
          <SvgIcon v-else name="play" width="14" height="14" />
        </button>
      </template>
    </div>

    <div class="row__cover" v-lazy-bg="displayCover">
      <span v-if="!displayCover" class="row__cover-fallback accent-gradient" />
    </div>

    <div class="row__main">
      <div class="row__title" :title="track.title + (track.subtitle ? ' (' + track.subtitle + ')' : '')">
        <span class="row__title-text">{{ track.title }}</span>
        <span v-if="track.subtitle" class="row__subtitle">{{ track.subtitle }}</span>
        <span v-if="track.is_explicit" class="row__explicit" title="Explicit">E</span>
      </div>
      <div class="row__artist-wrap" :title="track.artist">
        <template v-if="track.main_artists?.length">
          <template v-for="(artist, idx) in track.main_artists" :key="artist.id || artist.name">
            <button class="row__artist" @click.stop="gotoSpecificArtist(artist.id, artist.name)">{{ artist.name }}</button><span v-if="idx < track.main_artists.length - 1" class="row__artist-comma">, </span>
          </template>
        </template>
        <template v-else>
          <button class="row__artist" @click.stop="gotoSpecificArtist(undefined, track.artist)">{{ track.artist }}</button>
        </template>
      </div>
    </div>

    <div class="row__actions">
      <button
        v-if="isMyPlaylistMember && track.owner_id !== -999999"
        class="row__action row__action--remove-playlist"
        title="Удалить из плейлиста"
        aria-label="Удалить из плейлиста"
        @click.stop="removeFromPlaylist"
      >
        <SvgIcon name="cross" width="16" height="16" />
      </button>

      <button
        v-if="track.owner_id === -999999"
        class="row__action row__action--remove-playlist"
        title="Скрыть из медиатеки (оставить на диске)"
        aria-label="Скрыть из медиатеки"
        @click.stop="deleteLocalDb"
      >
        <SvgIcon name="cross" width="16" height="16" />
      </button>

      <button
        v-if="track.owner_id === -999999"
        class="row__action row__action--remove-playlist"
        title="Удалить файл с диска"
        aria-label="Удалить файл с диска"
        @click.stop="deleteLocalDisk"
      >
        <SvgIcon name="cross" width="16" height="16" style="color: var(--danger)" />
      </button>

      <template v-if="settings.trackContextMenuStyle === 'dots'">
        <template v-for="item in trackItems" :key="item.id">
        <template v-if="track.owner_id !== -999999 || item.id === 'queue'">
          <button
            v-if="item.id === 'library'"
            class="row__action row__action--lib"
            :class="{ 'row__action--in-lib': inLibrary }"
            :title="inLibrary ? 'Удалить из библиотеки' : 'В библиотеку'"
            @click.stop="toggleLibrary"
          >
            <SvgIcon v-if="!inLibrary" name="plus" width="18" height="18" />
            <template v-else>
              <SvgIcon name="check" class="row__lib-check" width="18" height="18" />
              <SvgIcon name="cross" class="row__lib-x" width="18" height="18" />
            </template>
          </button>
          <button v-else-if="item.id === 'uncensored'" class="row__action" title="Без цензуры" aria-label="Без цензуры" @click.stop="uncensoredSearch">
            <SvgIcon name="uncensored" width="18" height="18" />
          </button>
          <button v-else-if="item.id === 'similar'" class="row__action" title="Похожие" aria-label="Похожие" @click.stop="openSimilar">
            <SvgIcon name="similar" width="18" height="18" />
          </button>
          <button v-else-if="item.id === 'queue'" class="row__action" title="Слушать далее" aria-label="Слушать далее" @click.stop="addToQueue">
            <SvgIcon name="queue_add" width="18" height="18" />
          </button>
          <button v-else-if="item.id === 'share'" class="row__action" title="Поделиться" aria-label="Поделиться" @click.stop="shareTrack">
            <SvgIcon name="share" width="16" height="16" />
          </button>
          <button
            v-else-if="item.id === 'dislike'"
            class="row__action row__action--dislike"
            :class="{ 'row__action--disliked': isDisliked }"
            :title="isDisliked ? 'Отменить дизлайк' : 'Не нравится (больше не показывать)'"
            aria-label="Не нравится"
            @click.stop="dislikeTrack"
          >
            <SvgIcon name="dislike" width="16" height="16" />
          </button>
        </template>
      </template>

      <!-- Single Track Download Button -->
      <button
        v-if="track.owner_id !== -999999 && !isDownloaded && !isDownloading"
        class="row__action row__action--download"
        title="Скачать трек"
        aria-label="Скачать"
        @click.stop="downloadSingleTrack"
      >
        <SvgIcon name="download" width="16" height="16" />
      </button>
        <div v-else-if="isDownloading" class="row__download-spinner" title="Скачивается...">
          <div class="spinner-mini"></div>
        </div>
      </template>
      
      <button
        v-if="settings.trackContextMenuStyle === 'default'"
        class="row__action"
        title="Ещё"
        aria-label="Меню"
        @click.stop="ui.showTrackContextMenu($event, track, 'full')"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
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
    transform var(--motion-duration-base) var(--motion-ease-out),
    color var(--motion-duration-base) var(--motion-ease-out);
  content-visibility: auto;
  contain-intrinsic-size: auto 60px;
}
.row:hover {
  background: var(--bg-2);
}
.row--playing {
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent-1) 12%, transparent), color-mix(in srgb, var(--accent-3) 12%, transparent));
  color: var(--text-0);
}
.row--off {
  opacity: 0.55;
}
.row--compact {
  grid-template-columns: 32px 40px minmax(0, 1fr) 56px;
  gap: 12px;
  padding: 6px 10px;
  contain-intrinsic-size: auto 50px;
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
  font-size: calc(13px * var(--font-scale, 1));
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
  justify-content: center;
  color: var(--text-0);
  background: var(--bg-3);
  opacity: 0;
  transition: opacity var(--motion-duration-base) var(--motion-ease-out),
              background var(--motion-duration-base) var(--motion-ease-out),
              transform var(--motion-duration-base) var(--motion-ease-out);
}
.row__play:hover {
  transform: scale(var(--motion-scale-hover));
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
  color: var(--text-primary);
  font-size: calc(14px * var(--font-scale, 1));
  white-space: nowrap;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.row__title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
}
.row__subtitle {
  color: #828282;
  font-weight: 400;
  margin-left: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 2;
}
.row__explicit {
  display: inline-block;
  background: var(--bg-3);
  color: var(--text-1);
  padding: 0 5px;
  font-size: calc(9px * var(--font-scale, 1));
  border-radius: 3px;
  font-weight: 700;
  letter-spacing: calc(0.04em + var(--letter-spacing, 0px));
  flex-shrink: 0;
}
.row__artist-wrap {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.row__artist {
  margin-top: 2px;
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
  text-align: left;
  display: inline-block;
}
.row__artist-comma {
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
}
.row__artist:hover {
  color: var(--text-0);
}
.row__actions {
  display: inline-flex;
  gap: 4px;
  opacity: 0;
  transition: color var(--motion-duration-base) var(--motion-ease-out);
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
  transition: background var(--motion-duration-base) var(--motion-ease-out),
              color var(--motion-duration-base) var(--motion-ease-out),
              transform var(--motion-duration-base) var(--motion-ease-out);
}
.row__action:hover {
  background: var(--bg-3);
  color: var(--text-0);
  transform: scale(var(--motion-scale-hover));
}
.row__action--lib {
  position: relative;
}
.row__action--in-lib {
  color: var(--accent-1);
}
.row__action--disliked {
  color: var(--danger);
}
.row__action--disliked:hover {
  background: rgba(255, 94, 126, 0.12);
  color: var(--danger);
}
.row__action--remove-playlist:hover {
  background: rgba(255, 94, 126, 0.12);
  color: var(--danger);
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
  font-size: calc(12px * var(--font-scale, 1));
  text-align: right;
}
.row__checkbox-wrap {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.row__checkbox {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 2px solid var(--border-strong);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-text);
  transition: background var(--motion-duration-base) var(--motion-ease-out), border-color var(--motion-duration-base) var(--motion-ease-out);
}
.row__checkbox--checked {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  border-color: transparent;
}
.row__download-spinner {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.spinner-mini {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-top-color: var(--accent-1);
  border-radius: 50%;
  animation: spin-mini 1s linear infinite;
}
@keyframes spin-mini {
  to { transform: rotate(360deg); }
}
</style>
