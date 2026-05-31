import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { Howl } from "howler";
import Hls from "hls.js";
import type { Track } from "@/api/types";
import { useSettingsStore } from "./settings";

export type RepeatMode = "off" | "all" | "one";

/** Pluggable playback backend so HLS and progressive audio share one interface. */
interface PlaybackBackend {
  play(): void;
  pause(): void;
  isPlaying(): boolean;
  seek(seconds: number): void;
  position(): number;
  duration(): number;
  setVolume(volume: number): void;
  fadeOut(durationMs: number): void;
  fadeIn(durationMs: number, targetVolume: number): void;
  destroy(): void;
}

interface BackendCallbacks {
  onLoad: (duration: number) => void;
  onLoadError: () => void;
  onPlay: () => void;
  onPause: () => void;
  onEnd: () => void;
}

export function isHlsUrl(url: string): boolean {
  // VK sometimes returns chunked HLS streams (master.m3u8 / index.m3u8) instead
  // of a single-file MP3. Howler.js cannot decode HLS on its own.
  const lower = url.toLowerCase();
  return lower.includes(".m3u8") || lower.includes("/hls/");
}

function createHowlerBackend(
  url: string,
  initialVolume: number,
  cb: BackendCallbacks,
): PlaybackBackend {
  const sound = new Howl({
    src: [url],
    html5: true,
    volume: initialVolume,
    onload: () => cb.onLoad(sound.duration()),
    onloaderror: () => cb.onLoadError(),
    onplayerror: () => cb.onLoadError(),
    onplay: () => cb.onPlay(),
    onpause: () => cb.onPause(),
    onstop: () => cb.onPause(),
    onend: () => cb.onEnd(),
  });
  return {
    play: () => {
      sound.play();
    },
    pause: () => sound.pause(),
    isPlaying: () => sound.playing(),
    seek: (s) => {
      sound.seek(s);
    },
    position: () => (sound.seek() as number) || 0,
    duration: () => sound.duration(),
    setVolume: (v) => sound.volume(v),
    fadeOut: (ms) => {
      const v = sound.volume();
      sound.fade(v, 0, ms);
      window.setTimeout(() => {
        sound.off();
        sound.stop();
        sound.unload();
      }, ms + 50);
    },
    fadeIn: (ms, targetV) => {
      sound.volume(0);
      sound.fade(0, targetV, ms);
    },
    destroy: () => {
      sound.off();
      sound.stop();
      sound.unload();
    },
  };
}

function createHlsBackend(
  url: string,
  initialVolume: number,
  cb: BackendCallbacks,
): PlaybackBackend {
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = initialVolume;
  audio.crossOrigin = "anonymous";

  let hls: Hls | null = null;
  let loaded = false;

  const markLoaded = () => {
    if (loaded) return;
    loaded = true;
    cb.onLoad(Number.isFinite(audio.duration) ? audio.duration : 0);
  };

  audio.addEventListener("loadedmetadata", markLoaded);
  audio.addEventListener("canplay", markLoaded);
  audio.addEventListener("play", () => cb.onPlay());
  audio.addEventListener("pause", () => {
    if (audio.ended) return; // onEnd handles this
    cb.onPause();
  });
  audio.addEventListener("ended", () => cb.onEnd());
  audio.addEventListener("error", () => cb.onLoadError());

  // Safari handles HLS natively. For Chromium/Electron we need Hls.js → MSE.
  if (Hls.isSupported()) {
    hls = new Hls({ enableWorker: true });
    hls.loadSource(url);
    hls.attachMedia(audio);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        cb.onLoadError();
      }
    });
  } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
    audio.src = url;
  } else {
    // Last-ditch attempt: let the browser try anyway. Will most likely fire `error`.
    audio.src = url;
  }

  return {
    play: () => {
      void audio.play().catch(() => cb.onLoadError());
    },
    pause: () => audio.pause(),
    isPlaying: () => !audio.paused && !audio.ended,
    seek: (s) => {
      try {
        audio.currentTime = s;
      } catch {
        /* seeking before metadata is loaded — ignore */
      }
    },
    position: () => audio.currentTime || 0,
    duration: () => (Number.isFinite(audio.duration) ? audio.duration : 0),
    setVolume: (v) => {
      audio.volume = Math.max(0, Math.min(1, v));
    },
    fadeOut: (ms) => {
      let v = audio.volume;
      const steps = 20;
      const stepTime = ms / steps;
      const stepVol = v / steps;
      const iv = setInterval(() => {
        v -= stepVol;
        if (v <= 0) {
          clearInterval(iv);
          audio.pause();
          audio.removeAttribute("src");
          audio.load();
          if (hls) {
            hls.destroy();
            hls = null;
          }
        } else {
          audio.volume = v;
        }
      }, stepTime);
    },
    fadeIn: (ms, targetV) => {
      let v = 0;
      audio.volume = v;
      const steps = 20;
      const stepTime = ms / steps;
      const stepVol = targetV / steps;
      const iv = setInterval(() => {
        v += stepVol;
        if (v >= targetV) {
          audio.volume = targetV;
          clearInterval(iv);
        } else {
          audio.volume = v;
        }
      }, stepTime);
    },
    destroy: () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (hls) {
        hls.destroy();
        hls = null;
      }
    },
  };
}

export const usePlayerStore = defineStore("player", () => {
  const settings = useSettingsStore();

  const queue = ref<Track[]>([]);
  const originalQueue = ref<Track[]>([]); // for un-shuffle
  const index = ref(-1);
  const isPlaying = ref(false);
  const currentTime = ref(0);
  const loadingTrack = ref(false);
  const loadingMore = ref(false);
  const duration = ref(0);
  const repeat = ref<RepeatMode>("off");
  const shuffle = ref(false);
  // Volume is initialised from the user-configured startup volume on every
  // session. Runtime adjustments live only in this store — we don't write
  // back to settings.startupVolume so a quick tweak doesn't override the
  // user's chosen default at the next launch.
  const volume = ref(settings.startupVolume);
  const muted = ref(false);

  let backend: PlaybackBackend | null = null;
  let tickHandle: number | null = null;
  let nearEndCallback: (() => void) | null = null;

  const current = computed<Track | null>(() => {
    if (index.value < 0 || index.value >= queue.value.length) return null;
    return queue.value[index.value];
  });

  const hasNext = computed(() => index.value + 1 < queue.value.length || repeat.value === "all");
  const hasPrev = computed(() => index.value > 0 || repeat.value === "all");

  watch(volume, (v) => {
    if (backend) backend.setVolume(muted.value ? 0 : v);
  });
  watch(muted, (m) => {
    if (backend) backend.setVolume(m ? 0 : volume.value);
  });

  watch(index, () => {
    if (nearEndCallback && queue.value.length > 0 && index.value >= queue.value.length - 10) {
      loadMoreQueue();
    }
  });

  async function loadMoreQueue() {
    if (nearEndCallback && !loadingMore.value) {
      loadingMore.value = true;
      try {
        await nearEndCallback();
      } finally {
        loadingMore.value = false;
      }
    }
  }

  let isCrossfading = false;

  function startTick() {
    stopTick();
    isCrossfading = false;
    tickHandle = window.setInterval(() => {
      if (backend && backend.isPlaying()) {
        const pos = backend.position();
        const dur = backend.duration();
        currentTime.value = pos;

        // Crossfade logic
        if (settings.crossfade && dur > 0 && !isCrossfading) {
          const cfDur = settings.crossfadeDuration;
          const remaining = dur - pos;
          if (remaining <= cfDur && remaining > 0.5 && hasNext.value) {
            isCrossfading = true;
            const oldBackend = backend;
            backend = null;
            oldBackend.fadeOut(cfDur * 1000);

            if (index.value + 1 < queue.value.length) {
              index.value += 1;
            } else if (repeat.value === "all") {
              index.value = 0;
            }
            loadCurrent(true, cfDur * 1000);
          }
        }
      }
    }, 250);
  }

  function stopTick() {
    if (tickHandle !== null) {
      window.clearInterval(tickHandle);
      tickHandle = null;
    }
  }

  function destroyBackend() {
    stopTick();
    if (backend) {
      backend.destroy();
      backend = null;
    }
  }

  function loadCurrent(autoPlay: boolean, fadeInMs?: number) {
    destroyBackend();
    const track = current.value;
    if (!track || !track.url) {
      isPlaying.value = false;
      return;
    }
    loadingTrack.value = true;
    currentTime.value = 0;
    duration.value = track.duration;

    const initialVolume = muted.value ? 0 : volume.value;
    let thisBackend: PlaybackBackend | null = null;
    const callbacks: BackendCallbacks = {
      onLoad: (d) => {
        if (backend !== thisBackend) return;
        loadingTrack.value = false;
        if (d > 0) duration.value = d;
      },
      onLoadError: () => {
        if (backend !== thisBackend) return;
        loadingTrack.value = false;
        isPlaying.value = false;
      },
      onPlay: () => {
        if (backend !== thisBackend) return;
        isPlaying.value = true;
        startTick();
      },
      onPause: () => {
        if (backend !== thisBackend) return;
        isPlaying.value = false;
      },
      onEnd: () => {
        if (backend !== thisBackend) return;
        handleEnd();
      },
    };

    thisBackend = isHlsUrl(track.url)
      ? createHlsBackend(track.url, initialVolume, callbacks)
      : createHowlerBackend(track.url, initialVolume, callbacks);
    backend = thisBackend;

    if (autoPlay) {
      backend.play();
      if (fadeInMs && fadeInMs > 0) {
        backend.fadeIn(fadeInMs, initialVolume);
      }
    }
  }

  function handleEnd() {
    if (repeat.value === "one") {
      if (backend) {
        backend.seek(0);
        backend.play();
      }
      return;
    }
    if (index.value + 1 < queue.value.length) {
      index.value += 1;
      loadCurrent(true);
    } else if (repeat.value === "all") {
      index.value = 0;
      loadCurrent(true);
    } else {
      isPlaying.value = false;
      stopTick();
    }
  }

  function playQueue(tracks: Track[], startIndex = 0, onNearEnd?: () => Promise<void> | void) {
    const filtered = tracks.filter((t) => t.url);
    originalQueue.value = [...filtered];
    queue.value = shuffle.value ? shuffleArray(filtered, startIndex) : [...filtered];
    index.value = shuffle.value ? 0 : Math.min(Math.max(0, startIndex), filtered.length - 1);
    nearEndCallback = onNearEnd || null;
    loadCurrent(true);
  }

  function playTrack(track: Track) {
    playQueue([track]);
  }

  function enqueueNext(track: Track) {
    if (!track.url) return;
    queue.value.splice(index.value + 1, 0, track);
    originalQueue.value = [...queue.value];
  }

  function appendToQueue(track: Track) {
    if (!track.url) return;
    queue.value.push(track);
    originalQueue.value = [...queue.value];
  }

  function appendTracksToQueue(tracks: Track[]) {
    const valid = tracks.filter((t) => t.url);
    if (valid.length === 0) return;
    queue.value.push(...valid);
    originalQueue.value = [...queue.value];
  }

  function togglePlay() {
    if (!backend) {
      if (current.value) loadCurrent(true);
      return;
    }
    if (backend.isPlaying()) {
      backend.pause();
    } else {
      backend.play();
    }
  }

  function play() {
    if (!backend && current.value) loadCurrent(true);
    backend?.play();
  }

  function pause() {
    backend?.pause();
  }

  function next() {
    if (index.value + 1 < queue.value.length) {
      index.value += 1;
      loadCurrent(true);
    } else if (repeat.value === "all" && queue.value.length) {
      index.value = 0;
      loadCurrent(true);
    }
  }

  function prev() {
    if (backend && backend.position() > 3) {
      backend.seek(0);
      return;
    }
    if (index.value > 0) {
      index.value -= 1;
      loadCurrent(true);
    } else if (repeat.value === "all" && queue.value.length) {
      index.value = queue.value.length - 1;
      loadCurrent(true);
    }
  }

  function seek(seconds: number) {
    if (backend) {
      backend.seek(seconds);
      currentTime.value = seconds;
    }
  }

  function toggleShuffle() {
    shuffle.value = !shuffle.value;
    const playing = current.value;
    if (shuffle.value) {
      const reordered = playing
        ? shuffleArray(originalQueue.value, originalQueue.value.indexOf(playing))
        : shuffleArray(originalQueue.value, 0);
      queue.value = reordered;
      index.value = playing ? reordered.indexOf(playing) : 0;
    } else {
      queue.value = [...originalQueue.value];
      index.value = playing ? originalQueue.value.indexOf(playing) : 0;
    }
  }

  function cycleRepeat() {
    repeat.value = repeat.value === "off" ? "all" : repeat.value === "all" ? "one" : "off";
  }

  function toggleMute() {
    muted.value = !muted.value;
  }

  function setVolume(v: number) {
    volume.value = Math.max(0, Math.min(1, v));
    if (volume.value > 0 && muted.value) muted.value = false;
  }

  function clear() {
    destroyBackend();
    queue.value = [];
    originalQueue.value = [];
    index.value = -1;
    duration.value = 0;
    currentTime.value = 0;
    isPlaying.value = false;
    nearEndCallback = null;
  }

  function removeFromQueue(target: number) {
    if (target < 0 || target >= queue.value.length) return;
    const removed = queue.value.splice(target, 1)[0];
    originalQueue.value = originalQueue.value.filter(
      (t) => !(t.id === removed.id && t.owner_id === removed.owner_id)
    );
    if (target < index.value) {
      index.value -= 1;
    } else if (target === index.value) {
      if (queue.value.length === 0) {
        clear();
        return;
      }
      if (index.value >= queue.value.length) index.value = queue.value.length - 1;
      loadCurrent(isPlaying.value);
    }
  }

  function moveInQueue(from: number, to: number) {
    if (from === to) return;
    if (from < 0 || from >= queue.value.length) return;
    const clamped = Math.max(0, Math.min(queue.value.length - 1, to));
    const [moved] = queue.value.splice(from, 1);
    queue.value.splice(clamped, 0, moved);
    // Keep `index` pointed at the currently-playing track so we don't stutter.
    if (from === index.value) {
      index.value = clamped;
    } else if (from < index.value && clamped >= index.value) {
      index.value -= 1;
    } else if (from > index.value && clamped <= index.value) {
      index.value += 1;
    }
    originalQueue.value = [...queue.value];
  }

  return {
    queue,
    index,
    isPlaying,
    currentTime,
    duration,
    repeat,
    shuffle,
    volume,
    muted,
    loadingTrack,
    loadingMore,
    isShuffled: shuffle,
    current,
    hasNext,
    hasPrev,
    playQueue,
    playTrack,
    enqueueNext,
    appendToQueue,
    appendTracksToQueue,
    loadMoreQueue,
    togglePlay,
    play,
    pause,
    next,
    prev,
    seek,
    toggleShuffle,
    cycleRepeat,
    toggleMute,
    setVolume,
    clear,
    removeFromQueue,
    moveInQueue,
  };
});

function shuffleArray<T>(arr: T[], pinIndex: number): T[] {
  const copy = [...arr];
  if (pinIndex < 0 || pinIndex >= copy.length) {
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
  const pinned = copy.splice(pinIndex, 1)[0];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return [pinned, ...copy];
}
