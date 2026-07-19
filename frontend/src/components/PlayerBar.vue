<script setup lang="ts">
import { computed, ref, toRef } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { useDislikesStore } from "@/stores/dislikes";
import { useUIStore } from "@/stores/ui";
import { useEqualizerStore } from "@/stores/equalizer";
import { formatDuration } from "@/composables/useFormat";
import { useExternalArt } from "@/composables/useExternalArt";
import EqualizerModal from "./EqualizerModal.vue";
import SvgIcon from "./SvgIcon.vue";

const player = usePlayerStore();
const library = useLibraryStore();
const dislikes = useDislikesStore();
const ui = useUIStore();
const eq = useEqualizerStore();
const router = useRouter();

const { current, isPlaying, currentTime, duration, repeat, shuffle, volume, muted, loadingTrack } =
  storeToRefs(player);

const seekDraft = ref<number | null>(null);
const isSeeking = computed(() => seekDraft.value !== null);
const displayTime = computed(() => (isSeeking.value ? (seekDraft.value as number) : currentTime.value));
const progressPct = computed(() => {
  if (!duration.value) return 0;
  return Math.min(1, displayTime.value / duration.value) * 100;
});

const inLibrary = computed(() => (current.value ? library.isInLibrary(current.value) : false));

function onSeekInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  seekDraft.value = value;
}
function onSeekCommit(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  player.seek(value);
  seekDraft.value = null;
}

async function toggleLibrary() {
  if (!current.value) return;
  try {
    if (inLibrary.value) {
      await library.removeFromLibrary(current.value);
      ui.notify("Удалено из библиотеки", "success");
    } else {
      await library.addToLibrary(current.value);
      ui.notify("Добавлено в библиотеку", "success");
    }
  } catch (err) {
    ui.notify((err as Error).message || "Не удалось", "error");
  }
}

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

function uncensoredSearch() {
  if (!current.value) return;
  const main = current.value.main_artists[0];
  const q = `${main?.name || current.value.artist} ${current.value.title}`.trim();
  if (q) router.push({ name: "search", query: { q, mode: "any" } });
}

function openSimilar() {
  if (!current.value) return;
  router.push({
    name: "similar",
    params: { audioId: `${current.value.owner_id}_${current.value.id}` },
    query: {
      artist: current.value.artist || undefined,
      title: current.value.title || undefined,
    },
  });
}

function addToQueue() {
  if (!current.value) return;
  player.enqueueNext(current.value);
  ui.notify("Трек будет играть следующим", "success");
}

const isDisliked = computed(() => (current.value ? dislikes.isDisliked(current.value) : false));

function dislikeTrack() {
  if (!current.value) return;
  const track = current.value;
  if (isDisliked.value) {
    dislikes.undislike(track);
    ui.notify("Дизлайк отменен", "success");
  } else {
    dislikes.dislike(track);
    if (player.hasNext) {
      player.next();
    }
    player.removeTrack(track);
    ui.notify("Больше не будет попадаться", "success");
  }
}

const showEqModal = ref(false);
const eqEnabled = computed(() => eq.enabled);

const showRemainingTime = ref(false);
function toggleTimeMode() {
  showRemainingTime.value = !showRemainingTime.value;
}

// Cover-art fallback (iTunes) when VK doesn't ship a cover. The composable
// no-ops when the setting is off or when VK already has artwork.
const trackArtist = computed(() => current.value?.main_artists[0]?.name || current.value?.artist || null);
const trackTitle = computed(() => current.value?.title || null);
const hasVkCover = computed(() => !!current.value?.album_cover);
const { cover: externalCover } = useExternalArt(
  trackArtist,
  trackTitle,
  toRef(() => hasVkCover.value)
);
const displayCover = computed(() => current.value?.album_cover || externalCover.value || null);

// Logarithmic taper: humans perceive loudness roughly on a log scale, so
// linearly dragging the slider feels wrong (most usable range crammed into the
// last 20%). x³ keeps the slider 1:1 visually with the position while giving
// smooth low-volume control. See https://www.dr-lex.be/info-stuff/volumecontrols.html.
function volumeToGain(x: number): number {
  const clamped = Math.max(0, Math.min(1, x));
  return clamped * clamped * clamped;
}

function onVolumeInput(event: Event) {
  const slider = Number((event.target as HTMLInputElement).value);
  player.setVolume(volumeToGain(slider));
}

const volumeSliderPos = computed(() => {
  const gain = muted.value ? 0 : volume.value;
  return Math.cbrt(Math.max(0, Math.min(1, gain)));
});

const volumePct = computed(() => Math.round(volumeSliderPos.value * 100));
</script>

<template>
  <footer class="player">
    <div class="player__track">
      <TransitionGroup tag="div" name="track-anim" class="player__cover-wrap">
        <div class="player__cover" :style="displayCover ? { backgroundImage: `url(${displayCover})` } : {}" :key="current ? current.owner_id + '_' + current.id : 'empty'">
          <span v-if="!displayCover" class="player__cover-fallback accent-gradient" />
        </div>
      </TransitionGroup>
      
      <TransitionGroup tag="div" name="track-anim" class="player__info-group">
        <div v-if="current" class="player__info-wrap" :key="current.owner_id + '_' + current.id">
            <div class="player__title" :title="current.title">
              {{ current.title }}
              <span v-if="current.subtitle" class="player__subtitle">{{ current.subtitle }}</span>
            </div>
            <div class="player__artist-wrap" :title="current.artist">
              <template v-if="current.main_artists?.length">
                <template v-for="(artist, idx) in current.main_artists" :key="artist.id || artist.name">
                  <button class="player__artist" @click="gotoSpecificArtist(artist.id, artist.name)">{{ artist.name }}</button><span v-if="idx < current.main_artists.length - 1" class="player__artist-comma">, </span>
                </template>
              </template>
              <template v-else>
                <button class="player__artist" @click="gotoSpecificArtist(undefined, current.artist)">{{ current.artist }}</button>
              </template>
            </div>
        </div>
        <div v-else class="player__info-wrap" key="empty-info">
          <div class="player__title player__title--empty">Выберите трек</div>
          <div class="player__artist-wrap">
            <div class="player__artist player__artist--empty"></div>
          </div>
        </div>

        <div class="player__lib-wrap" key="lib-btn">
          <button
            v-if="current"
            :key="inLibrary ? 'in' : 'out'"
            class="player__icon-btn player__icon-btn--lib"
            :class="{ 'player__icon-btn--active': inLibrary }"
            :aria-label="inLibrary ? 'Удалить из библиотеки' : 'Добавить в библиотеку'"
            :title="inLibrary ? 'Удалить из библиотеки' : 'Добавить в библиотеку'"
            @click="toggleLibrary"
          >
            <SvgIcon v-if="!inLibrary" name="plus" width="22" height="22" />
            <template v-else>
              <SvgIcon name="check" class="player__lib-check" width="22" height="22" />
              <SvgIcon name="cross" class="player__lib-remove" width="22" height="22" />
            </template>
          </button>
        </div>
      </TransitionGroup>
    </div>

    <div class="player__controls">
      <div class="player__buttons">
        <div class="player__actions">
          <button class="player__icon-btn" :disabled="!current" title="Без цензуры" aria-label="Без цензуры" @click="uncensoredSearch">
            <SvgIcon name="uncensored" width="22" height="22" />
          </button>
          <button class="player__icon-btn" :disabled="!current" title="Похожие (рекомендации ВК)" aria-label="Похожие" @click="openSimilar">
            <SvgIcon name="similar" width="22" height="22" />
          </button>
        </div>

        <div class="player__divider"></div>

        <button
          class="player__icon-btn"
          :class="{ 'player__icon-btn--active': shuffle }"
          :aria-label="shuffle ? 'Выключить перемешивание' : 'Включить перемешивание'"
          :title="shuffle ? 'Выключить перемешивание' : 'Включить перемешивание'"
          @click="player.toggleShuffle()"
        >
          <SvgIcon name="shuffle" width="22" height="22" />
        </button>
        <button class="player__icon-btn" :disabled="!player.hasPrev" aria-label="Предыдущий" title="Предыдущий трек" @click="player.prev()">
          <SvgIcon name="prev" width="24" height="24" />
        </button>
        <button class="player__play" :aria-label="isPlaying ? 'Пауза' : 'Воспроизвести'" :title="isPlaying ? 'Пауза' : 'Воспроизвести'" @click="player.togglePlay()">
          <svg v-if="loadingTrack" viewBox="0 0 24 24" width="24" height="24" class="player__spinner">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="14 30" />
          </svg>
          <SvgIcon v-else-if="isPlaying" name="pause" width="24" height="24" />
          <SvgIcon v-else name="play" width="24" height="24" />
        </button>
        <button class="player__icon-btn" :disabled="!player.hasNext" aria-label="Следующий" title="Следующий трек" @click="player.next()">
          <SvgIcon name="next" width="24" height="24" />
        </button>
        <button
          class="player__icon-btn"
          :class="{ 'player__icon-btn--active': repeat !== 'off' }"
          :aria-label="`Повтор: ${repeat}`"
          :title="repeat === 'off' ? 'Включить повтор' : (repeat === 'all' ? 'Повторять один трек' : 'Выключить повтор')"
          @click="player.cycleRepeat()"
        >
          <SvgIcon name="repeat" width="22" height="22" />
          <span v-if="repeat === 'one'" class="player__repeat-badge">1</span>
        </button>

        <div class="player__divider"></div>

        <div class="player__actions">
          <button class="player__icon-btn" :disabled="!current" title="Слушать далее" aria-label="Слушать далее" @click="addToQueue">
            <SvgIcon name="queue_add" width="22" height="22" />
          </button>
          <button
            class="player__icon-btn"
            :class="{ 'player__icon-btn--disliked': isDisliked }"
            :disabled="!current"
            :title="isDisliked ? 'Отменить дизлайк' : 'Не нравится (больше не показывать)'"
            aria-label="Не нравится"
            @click="dislikeTrack"
          >
            <SvgIcon name="dislike" width="20" height="20" />
          </button>
        </div>
      </div>
      <div class="player__seek">
        <span class="player__time player__time--clickable" @click="toggleTimeMode">
          {{ showRemainingTime ? "-" + formatDuration(Math.max(0, (duration || 0) - displayTime)) : formatDuration(displayTime) }}
        </span>
        <div class="player__scrubber" :style="{ '--progress-pct': progressPct }">
          <div class="player__scrubber-track" />
          <div class="player__scrubber-fill" :class="{ 'player__scrubber-fill--seeking': isSeeking }" />
          <input
            class="player__scrubber-input"
            type="range"
            :min="0"
            :max="duration || 0"
            :value="displayTime"
            :step="0.1"
            @input="onSeekInput"
            @change="onSeekCommit"
            :disabled="!current"
          />
        </div>
        <span class="player__time">{{ formatDuration(duration) }}</span>
      </div>
    </div>

    <div class="player__right">
      <div class="player__volume">
        <button 
          class="player__icon-btn" 
          :class="{ 'player__icon-btn--active': eqEnabled }"
          title="Эквалайзер" 
          aria-label="Эквалайзер" 
          @click="showEqModal = true"
        >
          <SvgIcon name="equalizer" width="22" height="22" />
        </button>
        <div class="player__volume-slider-wrap">
          <button
            class="player__icon-btn"
          :aria-label="muted ? 'Включить звук' : 'Выключить звук'"
          :title="muted ? 'Включить звук' : 'Выключить звук'"
          @click="player.toggleMute()"
        >
          <SvgIcon v-if="muted || volume === 0" name="volume_mute" width="22" height="22" />
          <SvgIcon v-else name="volume_high" width="22" height="22" />
        </button>
        <div
          class="player__volume-track"
          :style="{ '--volume-pos': volumeSliderPos }"
        >
          <div class="player__volume-fill" />
          <input
            class="player__volume-input"
            type="range"
            min="0"
            max="1"
            step="0.001"
            :value="volumeSliderPos"
            :aria-valuetext="`${volumePct}%`"
            @input="onVolumeInput"
          />
        </div>
        </div>
      </div>
    </div>
    
    <EqualizerModal :show="showEqModal" @close="showEqModal = false" />
  </footer>
</template>

<style scoped>
.player {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: var(--bg-player);
  backdrop-filter: var(--app-blur);
  border-top: 1px solid var(--border);
  height: var(--player-height);
  box-shadow: var(--app-shadow);
  position: relative;
}
.player::before {
  content: "";
  display: var(--app-noise-display);
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E");
  z-index: 10;
}
.player__track {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 30%;
  min-width: 0;
}
.player__cover-wrap {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  position: relative;
}
.player__cover {
  width: 100%;
  height: 100%;
  border-radius: 10px;
  background-color: var(--bg-3);
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
}
.player__info-group {
  display: flex;
  align-items: center;
  gap: 12px;
  position: relative;
  min-width: 0;
  flex: 1;
  align-self: stretch;
}
.player__info-wrap {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  height: 100%;
}
.track-anim-move,
.track-anim-enter-active,
.track-anim-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}
.track-anim-leave-active {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 100%;
  pointer-events: none;
}
.player__info-group > .track-anim-leave-active {
  width: calc(100% - 44px);
}
.track-anim-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
}
.track-anim-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.95);
}
.player__lib-wrap {
  flex-shrink: 0;
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.player__cover-fallback {
  position: absolute;
  inset: 0;
  display: block;
}
.player__track-info {
  min-width: 0;
}
.player__title {
  font-weight: 600;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  line-height: 1.3;
}
.player__subtitle {
  color: var(--text-2);
  font-weight: 400;
  font-size: 0.9em;
  margin-left: 4px;
}
.player__title--empty {
  color: var(--text-2);
}
.player__artist-wrap {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  max-width: 100%;
}
.player__artist {
  margin-top: 2px;
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
  text-align: left;
  display: inline;
  transition: color var(--motion-duration-base) var(--motion-ease-out);
}
.player__time {
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
  min-width: 40px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.player__time--clickable {
  cursor: pointer;
  user-select: none;
}
.player__time--clickable:hover {
  color: var(--text-1);
}
.player__artist-comma {
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
}
.player__artist:hover {
  color: var(--text-0);
}
.player__artist--empty:hover {
  color: var(--text-2);
  cursor: default;
}
.player__controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  min-width: 0;
  max-width: 100%;
}
.player__buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}
.player__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.player__divider {
  width: 1px;
  height: 16px;
  background: var(--border);
  margin: 0 16px;
}
.player__play {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: white;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--motion-duration-base) var(--motion-ease-out);
}
.player__play:hover {
  transform: scale(var(--motion-scale-hover));
}
.player__spinner {
  animation: spin 0.9s linear infinite;
}
[data-perf="on"] .player__spinner {
  animation: none;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.player__icon-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-1);
  position: relative;
  transition: background var(--motion-duration-base) var(--motion-ease-out), color var(--motion-duration-base) var(--motion-ease-out);
}
.player__icon-btn:hover:not(:disabled) {
  background: var(--bg-2);
  color: var(--text-0);
}
.player__icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.player__icon-btn--active {
  color: var(--accent-1);
}
.player__icon-btn--disliked {
  color: var(--danger);
}
.player__repeat-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: calc(9px * var(--font-scale, 1));
  font-weight: 700;
  background: var(--accent-1);
  color: #fff;
  padding: 0 3px;
  border-radius: 4px;
  line-height: 1.3;
}
.player__seek {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.player__time {
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  font-size: calc(11px * var(--font-scale, 1));
  min-width: 38px;
  text-align: center;
}
.player__scrubber {
  --scrubber-thumb: 14px;
  position: relative;
  flex: 1 1 auto;
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 calc(var(--scrubber-thumb) / 2);
}
.player__scrubber-track {
  position: absolute;
  left: calc(var(--scrubber-thumb) / 2);
  right: calc(var(--scrubber-thumb) / 2);
  top: 0;
  bottom: 0;
  margin: auto;
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
}
.player__scrubber-fill {
  position: absolute;
  left: calc(var(--scrubber-thumb) / 2);
  top: 0;
  bottom: 0;
  margin: auto;
  height: 4px;
  width: calc((100% - var(--scrubber-thumb)) * (var(--progress-pct) / 100));
  background: linear-gradient(90deg, var(--accent-1), var(--accent-3));
  border-radius: 2px;
  transition: width 0.1s linear;
  pointer-events: none;
}
.player__scrubber-fill--seeking {
  transition: none !important;
}
.player__scrubber-input {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  margin: auto;
  width: 100%;
  height: 14px;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
  opacity: 0;
}
.player__scrubber-input::-webkit-slider-runnable-track {
  height: 14px;
  background: transparent;
}
.player__scrubber-input::-moz-range-track {
  height: 14px;
  background: transparent;
}
.player__scrubber-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 14px;
  width: 14px;
  border-radius: 50%;
  cursor: pointer;
  margin-top: 0;
}
.player__scrubber-input::-moz-range-thumb {
  height: 14px;
  width: 14px;
  border-radius: 50%;
  cursor: pointer;
}
.player__volume {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
}
.player__volume-slider-wrap {
  display: flex;
  align-items: center;
  gap: 0;
}
.player__actions-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.player__right {
  display: flex;
  align-items: center;
  gap: 16px;
  justify-content: flex-end;
  min-width: 0;
  flex: 1 1 30%;
}
.player__volume-track {
  /* The thumb is 14px wide — native range inputs centre the thumb on the
   * value, so its centre lives at `7px … (width - 7px)`. The fill needs to
   * match that, otherwise the bar drifts visibly when volume is low. */
  --volume-thumb: 14px;
  --volume-pos: 0;
  position: relative;
  width: 110px;
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 calc(var(--volume-thumb) / 2);
}
.player__volume-track::before {
  content: "";
  position: absolute;
  left: calc(var(--volume-thumb) / 2);
  right: calc(var(--volume-thumb) / 2);
  top: 0;
  bottom: 0;
  margin: auto;
  height: 5px;
  background: var(--border-strong);
  border-radius: 999px;
}
.player__volume-fill {
  position: absolute;
  left: calc(var(--volume-thumb) / 2);
  top: 0;
  bottom: 0;
  margin: auto;
  height: 5px;
  width: calc((100% - var(--volume-thumb)) * var(--volume-pos));
  background: linear-gradient(90deg, var(--accent-1), var(--accent-3));
  border-radius: 999px;
  pointer-events: none;
}
.player__volume-input {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  margin: auto;
  width: 100%;
  height: 14px;
  background: transparent;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}
.player__volume-input::-webkit-slider-runnable-track {
  height: 14px;
  background: transparent;
}
.player__volume-input::-moz-range-track {
  height: 14px;
  background: transparent;
}
.player__volume-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  height: 14px;
  width: 14px;
  border-radius: 50%;
  background: var(--text-0);
  border: 2px solid var(--accent-1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  margin-top: 0;
}
.player__volume-input::-moz-range-thumb {
  height: 14px;
  width: 14px;
  border-radius: 50%;
  background: var(--text-0);
  border: 2px solid var(--accent-1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  cursor: pointer;
}
.player__icon-btn--lib .player__lib-remove {
  display: none;
  position: absolute;
  inset: 0;
  margin: auto;
  color: var(--danger);
}
.player__icon-btn--lib:hover .player__lib-remove {
  display: block;
}
.player__icon-btn--lib:hover .player__lib-check {
  display: none;
}
</style>
