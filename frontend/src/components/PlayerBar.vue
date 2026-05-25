<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { usePlayerStore } from "@/stores/player";
import { useLibraryStore } from "@/stores/library";
import { useUIStore } from "@/stores/ui";
import { formatDuration } from "@/composables/useFormat";

const player = usePlayerStore();
const library = useLibraryStore();
const ui = useUIStore();
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

function gotoArtist() {
  if (!current.value) return;
  const main = current.value.main_artists[0];
  if (main?.id) router.push({ name: "artist", params: { id: main.id } });
}
</script>

<template>
  <footer class="player">
    <div class="player__track">
      <div class="player__cover" :style="current?.album_cover ? { backgroundImage: `url(${current.album_cover})` } : undefined">
        <span v-if="!current?.album_cover" class="player__cover-fallback accent-gradient" />
      </div>
      <div v-if="current" class="player__track-info">
        <div class="player__title" :title="current.title">{{ current.title }}</div>
        <button class="player__artist" @click="gotoArtist">{{ current.artist }}</button>
      </div>
      <div v-else class="player__track-info">
        <div class="player__title player__title--empty">Выберите трек</div>
        <div class="player__artist player__artist--empty">из любого списка ниже</div>
      </div>
      <button
        v-if="current"
        class="player__icon-btn"
        :class="{ 'player__icon-btn--active': inLibrary }"
        :aria-label="inLibrary ? 'Удалить из библиотеки' : 'Добавить в библиотеку'"
        :title="inLibrary ? 'Удалить из библиотеки' : 'Добавить в библиотеку'"
        @click="toggleLibrary"
      >
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path v-if="inLibrary" fill="currentColor" d="M9 16.2 5.5 12.7 4 14.2 9 19.2 20 8.2 18.5 6.7z" />
          <path v-else fill="none" stroke="currentColor" stroke-width="2" d="M12 5v14M5 12h14" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="player__controls">
      <div class="player__buttons">
        <button
          class="player__icon-btn"
          :class="{ 'player__icon-btn--active': shuffle }"
          :aria-label="shuffle ? 'Выключить перемешивание' : 'Включить перемешивание'"
          @click="player.toggleShuffle()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 3h5v5" />
            <path d="M4 20 21 3" />
            <path d="M21 16v5h-5" />
            <path d="m15 15 6 6" />
            <path d="M4 4l5 5" />
          </svg>
        </button>
        <button class="player__icon-btn" :disabled="!player.hasPrev" aria-label="Предыдущий" @click="player.prev()">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14L8 12z" /></svg>
        </button>
        <button class="player__play" :aria-label="isPlaying ? 'Пауза' : 'Воспроизвести'" @click="player.togglePlay()">
          <svg v-if="loadingTrack" viewBox="0 0 24 24" width="22" height="22" class="player__spinner">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="14 30" />
          </svg>
          <svg v-else-if="isPlaying" viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        </button>
        <button class="player__icon-btn" :disabled="!player.hasNext" aria-label="Следующий" @click="player.next()">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l12-7z" /></svg>
        </button>
        <button
          class="player__icon-btn"
          :class="{ 'player__icon-btn--active': repeat !== 'off' }"
          :aria-label="`Повтор: ${repeat}`"
          @click="player.cycleRepeat()"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          <span v-if="repeat === 'one'" class="player__repeat-badge">1</span>
        </button>
      </div>
      <div class="player__seek">
        <span class="player__time">{{ formatDuration(displayTime) }}</span>
        <div class="player__scrubber">
          <div class="player__scrubber-track">
            <div class="player__scrubber-fill" :style="{ width: progressPct + '%' }" />
          </div>
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

    <div class="player__volume">
      <button
        class="player__icon-btn"
        :aria-label="muted ? 'Включить звук' : 'Выключить звук'"
        @click="player.toggleMute()"
      >
        <svg v-if="muted || volume === 0" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M16.5 12 22 6.5l-1.4-1.4L15 10.6 9.4 5 8 6.4 13.6 12 8 17.6 9.4 19 15 13.4l5.6 5.6 1.4-1.4z" />
        </svg>
        <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M3 9v6h4l5 5V4L7 9zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />
        </svg>
      </button>
      <input
        class="player__volume-input"
        type="range"
        min="0"
        max="1"
        step="0.01"
        :value="muted ? 0 : volume"
        @input="(e) => player.setVolume(Number((e.target as HTMLInputElement).value))"
      />
    </div>
  </footer>
</template>

<style scoped>
.player {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(360px, 2fr) minmax(180px, 1fr);
  align-items: center;
  padding: 12px 20px;
  gap: 24px;
  background: var(--bg-1);
  border-top: 1px solid var(--border);
  height: var(--player-height);
}
.player__track {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.player__cover {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  background-color: var(--bg-3);
  background-size: cover;
  background-position: center;
  position: relative;
  overflow: hidden;
  flex: 0 0 56px;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.player__title--empty {
  color: var(--text-2);
}
.player__artist {
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-2);
  text-align: left;
  transition: color var(--motion-duration-fast) var(--motion-ease-out);
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
}
.player__buttons {
  display: flex;
  align-items: center;
  gap: 8px;
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
  transition: transform var(--motion-duration-fast) var(--motion-ease-out);
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
  transition: background var(--motion-duration-fast) var(--motion-ease-out), color var(--motion-duration-fast) var(--motion-ease-out);
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
.player__repeat-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  font-size: 9px;
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
  font-size: 11px;
  min-width: 38px;
  text-align: center;
}
.player__scrubber {
  position: relative;
  flex: 1 1 auto;
  height: 24px;
  display: flex;
  align-items: center;
}
.player__scrubber-track {
  position: absolute;
  inset: 11px 0 auto 0;
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
  overflow: hidden;
}
.player__scrubber-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-1), var(--accent-3));
  transition: width 0.1s linear;
}
.player__scrubber-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.player__volume {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-self: end;
}
.player__volume-input {
  -webkit-appearance: none;
  appearance: none;
  width: 110px;
  height: 16px;
  background: transparent;
  display: block;
}
.player__volume-input::-webkit-slider-runnable-track {
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
}
.player__volume-input::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 12px;
  width: 12px;
  border-radius: 50%;
  background: var(--accent-1);
  margin-top: -4px;
  cursor: pointer;
}
.player__volume-input::-moz-range-track {
  height: 4px;
  background: var(--bg-3);
  border-radius: 2px;
}
.player__volume-input::-moz-range-thumb {
  height: 12px;
  width: 12px;
  border: none;
  border-radius: 50%;
  background: var(--accent-1);
  cursor: pointer;
}
</style>
