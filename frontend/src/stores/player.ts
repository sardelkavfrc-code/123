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
  const duration = ref(0);
  const repeat = ref<RepeatMode>("off");
  const shuffle = ref(false);
  const volume = ref(settings.volume);
  const muted = ref(false);
  const loadingTrack = ref(false);

  let backend: PlaybackBackend | null = null;
  let tickHandle: number | null = null;

  const current = computed<Track | null>(() => {
    if (index.value < 0 || index.value >= queue.value.length) return null;
    return queue.value[index.value];
  });

  const hasNext = computed(() => index.value + 1 < queue.value.length || repeat.value === "all");
  const hasPrev = computed(() => index.value > 0 || repeat.value === "all");

  watch(volume, (v) => {
    settings.volume = v;
    if (backend) backend.setVolume(muted.value ? 0 : v);
  });
  watch(muted, (m) => {
    if (backend) backend.setVolume(m ? 0 : volume.value);
  });

  function startTick() {
    stopTick();
    tickHandle = window.setInterval(() => {
      if (backend && backend.isPlaying()) {
        currentTime.value = backend.position();
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

  function loadCurrent(autoPlay: boolean) {
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
    const callbacks: BackendCallbacks = {
      onLoad: (d) => {
        loadingTrack.value = false;
        if (d > 0) duration.value = d;
      },
      onLoadError: () => {
        loadingTrack.value = false;
        isPlaying.value = false;
      },
      onPlay: () => {
        isPlaying.value = true;
        startTick();
      },
      onPause: () => {
        isPlaying.value = false;
      },
      onEnd: () => {
        handleEnd();
      },
    };

    backend = isHlsUrl(track.url)
      ? createHlsBackend(track.url, initialVolume, callbacks)
      : createHowlerBackend(track.url, initialVolume, callbacks);

    if (autoPlay) backend.play();
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

  function playQueue(tracks: Track[], startIndex = 0) {
    const filtered = tracks.filter((t) => t.url);
    originalQueue.value = [...filtered];
    queue.value = shuffle.value ? shuffleArray(filtered, startIndex) : [...filtered];
    index.value = shuffle.value ? 0 : Math.min(Math.max(0, startIndex), filtered.length - 1);
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
    current,
    hasNext,
    hasPrev,
    playQueue,
    playTrack,
    enqueueNext,
    appendToQueue,
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
