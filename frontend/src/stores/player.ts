import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import Hls from "hls.js";
import type { Track, AlbumSummary } from "@/api/types";
import { api } from "@/api/client";
import { useSettingsStore } from "./settings";
import { useEqualizerStore } from "./equalizer";
import { preloadExternalArt } from "@/composables/useExternalArt";

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
  fadeOut(durationMs: number, justPause?: boolean): void;
  fadeIn(durationMs: number, targetVolume: number): void;
  destroy(): void;
}

interface BackendCallbacks {
  onLoad: (duration: number) => void;
  onLoadError: (errCode?: number) => void;
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

function createHtml5Backend(
  url: string,
  initialVolume: number,
  cb: BackendCallbacks,
  eq: any
): PlaybackBackend {
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  eq.connectAudioElement(audio);

  audio.preload = "auto";
  audio.volume = initialVolume;

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
    if (audio.ended) return;
    cb.onPause();
  });
  audio.addEventListener("ended", () => cb.onEnd());
  audio.addEventListener("error", () => cb.onLoadError(audio.error?.code));

  audio.src = url;

  let fadeInterval: ReturnType<typeof setTimeout> | null = null;
  const clearFade = () => {
    if (fadeInterval) {
      clearTimeout(fadeInterval);
      fadeInterval = null;
    }
  };

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
        // ignore
      }
    },
    position: () => audio.currentTime || 0,
    duration: () => (Number.isFinite(audio.duration) ? audio.duration : 0),
    setVolume: (v) => {
      audio.volume = Math.max(0, Math.min(1, v));
    },
    fadeOut: (ms, justPause = false) => {
      clearFade();
      const startVolume = audio.volume;
      if (startVolume <= 0 || ms <= 0) {
        audio.pause();
        if (!justPause) {
          audio.removeAttribute("src");
          audio.load();
        }
        return;
      }
      const startTime = performance.now();
      const tick = () => {
        const elapsed = performance.now() - startTime;
        let progress = elapsed / ms;
        if (progress >= 1) progress = 1;
        
        audio.volume = Math.max(0, startVolume * (1 - progress));
        
        if (progress >= 1) {
          clearFade();
          audio.pause();
          if (!justPause) {
            audio.removeAttribute("src");
            audio.load();
          }
        } else {
          fadeInterval = setTimeout(tick, 20);
        }
      };
      fadeInterval = setTimeout(tick, 20);
    },
    fadeIn: (ms, targetV) => {
      clearFade();
      if (ms <= 0) {
        audio.volume = targetV;
        return;
      }
      audio.volume = 0;
      let startTime: number | null = null;
      const tick = () => {
        if (audio.readyState < 3 || audio.paused) {
          startTime = null;
          fadeInterval = setTimeout(tick, 20);
          return;
        }
        if (!startTime) startTime = performance.now();
        const elapsed = performance.now() - startTime;
        let progress = elapsed / ms;
        if (progress >= 1) progress = 1;
        
        audio.volume = Math.min(targetV, targetV * progress);
        
        if (progress >= 1) {
          clearFade();
        } else {
          fadeInterval = setTimeout(tick, 20);
        }
      };
      fadeInterval = setTimeout(tick, 20);
    },
    destroy: () => {
      clearFade();
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    },
  };
}

function createHlsBackend(
  url: string,
  initialVolume: number,
  cb: BackendCallbacks,
  eq: any,
  startTime?: number
): PlaybackBackend {
  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = initialVolume;
  audio.crossOrigin = "anonymous";
  eq.connectAudioElement(audio);

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
  audio.addEventListener("error", () => cb.onLoadError(audio.error?.code));

  // Safari handles HLS natively. For Chromium/Electron we need Hls.js → MSE.
  if (Hls.isSupported()) {
    hls = new Hls({ enableWorker: true, startPosition: startTime && startTime > 0 ? startTime : -1 });
    hls.loadSource(url);
    hls.attachMedia(audio);
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) {
        cb.onLoadError(data.type === Hls.ErrorTypes.NETWORK_ERROR ? 2 : undefined);
      }
    });
  } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
    audio.src = url;
  } else {
    // Last-ditch attempt: let the browser try anyway. Will most likely fire `error`.
    audio.src = url;
  }

  let fadeInterval: ReturnType<typeof setTimeout> | null = null;
  const clearFade = () => {
    if (fadeInterval) {
      clearTimeout(fadeInterval);
      fadeInterval = null;
    }
  };

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
    fadeOut: (ms, justPause = false) => {
      clearFade();
      const startVolume = audio.volume;
      if (startVolume <= 0 || ms <= 0) {
        audio.pause();
        if (!justPause) {
          audio.removeAttribute("src");
          audio.load();
          if (hls) {
            hls.destroy();
            hls = null;
          }
        }
        return;
      }
      const startTime = performance.now();
      const tick = () => {
        const elapsed = performance.now() - startTime;
        let progress = elapsed / ms;
        if (progress >= 1) progress = 1;
        
        audio.volume = Math.max(0, startVolume * (1 - progress));
        
        if (progress >= 1) {
          clearFade();
          audio.pause();
          if (!justPause) {
            audio.removeAttribute("src");
            audio.load();
            if (hls) {
              hls.destroy();
              hls = null;
            }
          }
        } else {
          fadeInterval = setTimeout(tick, 20);
        }
      };
      fadeInterval = setTimeout(tick, 20);
    },
    fadeIn: (ms, targetV) => {
      clearFade();
      if (ms <= 0) {
        audio.volume = targetV;
        return;
      }
      audio.volume = 0;
      let startTime: number | null = null;
      const tick = () => {
        if (audio.readyState < 3 || audio.paused) {
          startTime = null;
          fadeInterval = setTimeout(tick, 20);
          return;
        }
        if (!startTime) startTime = performance.now();
        const elapsed = performance.now() - startTime;
        let progress = elapsed / ms;
        if (progress >= 1) progress = 1;
        
        audio.volume = Math.min(targetV, targetV * progress);
        
        if (progress >= 1) {
          clearFade();
        } else {
          fadeInterval = setTimeout(tick, 20);
        }
      };
      fadeInterval = setTimeout(tick, 20);
    },
    destroy: () => {
      clearFade();
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

let tickHandle: number | null = null;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (tickHandle !== null) {
      window.clearInterval(tickHandle);
      tickHandle = null;
    }
  });
}

export const usePlayerStore = defineStore("player", () => {
  const settings = useSettingsStore();
  const eq = useEqualizerStore();

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
  const hasRepeatedOnce = ref(false);
  const currentPlaylist = ref<AlbumSummary | null>(null);
  // Volume is initialised from the user-configured startup volume on every
  // session. Runtime adjustments live only in this store — we don't write
  // back to settings.startupVolume so a quick tweak doesn't override the
  // user's chosen default at the next launch.
  const volume = ref(settings.startupVolume);
  const muted = ref(false);

  let backend: PlaybackBackend | null = null;
  let nearEndCallback: (() => void) | null = null;

  let prefetchAudio: HTMLAudioElement | null = null;
  let prefetchHls: Hls | null = null;
  let prefetchTimeout: number | undefined;
  let scrobbleTimeout: number | undefined;
  let scrobbledTrackId: number | null = null;

  function destroyPrefetch() {
    if (prefetchTimeout) {
      window.clearTimeout(prefetchTimeout);
    }
    if (prefetchAudio) {
      prefetchAudio.pause();
      prefetchAudio.removeAttribute("src");
      prefetchAudio.load();
      prefetchAudio = null;
    }
    if (prefetchHls) {
      prefetchHls.destroy();
      prefetchHls = null;
    }
  }

  async function prefetchNextTrack() {
    destroyPrefetch();

    if (!settings.prefetchEnabled) return;

    const nextIdx = index.value + 1;
    if (nextIdx < 0 || nextIdx >= queue.value.length) return;

    const nextTrack = queue.value[nextIdx];
    if (!nextTrack) return;
    
    if (!nextTrack.url) {
      try {
        const freshTrack = await api.refreshUrl(nextTrack.owner_id, nextTrack.id, nextTrack.access_key);
        nextTrack.url = freshTrack.url;
      } catch (e) {
        return;
      }
    }

    if (!nextTrack.url) return;

    if (nextTrack.cover_large) {
      const img = new Image();
      img.src = nextTrack.cover_large;
    } else {
      const artist = nextTrack.main_artists?.[0]?.name || nextTrack.artist;
      if (artist && nextTrack.title) {
        preloadExternalArt(artist, nextTrack.title).catch(() => {});
      }
    }

    console.log(`[Player] Prefetching next track: ${nextTrack.title}`);
    if (isHlsUrl(nextTrack.url)) {
      if (Hls.isSupported()) {
        prefetchAudio = new Audio();
        prefetchAudio.preload = "auto";
        prefetchHls = new Hls({ enableWorker: true });
        prefetchHls.loadSource(nextTrack.url);
        prefetchHls.attachMedia(prefetchAudio);
      }
    } else {
      prefetchAudio = new Audio();
      prefetchAudio.preload = "auto";
      prefetchAudio.src = nextTrack.url;
      prefetchAudio.load();
    }
  }

  const current = computed<Track | null>(() => {
    if (index.value < 0 || index.value >= queue.value.length) return null;
    return queue.value[index.value];
  });

  const hasNext = computed(() => index.value + 1 < queue.value.length);
  const hasPrev = computed(() => index.value > 0);

  watch(volume, (v) => {
    if (backend) backend.setVolume(muted.value ? 0 : v);
  });
  watch(muted, (m) => {
    if (backend) backend.setVolume(m ? 0 : volume.value);
  });

  watch(index, () => {
    hasRepeatedOnce.value = false;
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
          
          let willLoopSameTrack = false;
          let willGoNext = false;

          if (repeat.value === "all") {
             willLoopSameTrack = true;
          } else if (repeat.value === "one") {
             if (!hasRepeatedOnce.value) {
                 willLoopSameTrack = true;
             } else {
                 willGoNext = index.value + 1 < queue.value.length;
             }
          } else {
             willGoNext = index.value + 1 < queue.value.length;
          }

          if (remaining <= cfDur && remaining > 0.5 && (willLoopSameTrack || willGoNext)) {
            isCrossfading = true;
            const oldBackend = backend;
            backend = null;
            oldBackend.fadeOut(cfDur * 1000);

            if (willLoopSameTrack) {
              if (repeat.value === "one") {
                hasRepeatedOnce.value = true;
              }
              // keep the same index
            } else if (willGoNext) {
              index.value += 1;
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
    if (scrobbleTimeout) {
      window.clearTimeout(scrobbleTimeout);
      scrobbleTimeout = undefined;
    }
    stopTick();
    destroyPrefetch();
    if (backend) {
      backend.destroy();
      backend = null;
    }
  }

  async function loadCurrent(autoPlay: boolean, fadeInMs?: number, startTime?: number) {
    destroyBackend();
    const track = current.value;
    if (!track) {
      isPlaying.value = false;
      return;
    }

    if (!track.url) {
      loadingTrack.value = true;
      try {
        const freshTrack = await api.refreshUrl(track.owner_id, track.id, track.access_key);
        track.url = freshTrack.url;
      } catch (e) {
        isPlaying.value = false;
        loadingTrack.value = false;
        import("@/stores/ui").then(({ useUIStore }) => {
          useUIStore().notify("Трек недоступен в вашем регионе или удален. Переключаем...", "error");
        });
        if (index.value + 1 < queue.value.length) {
            next();
        }
        return;
      }
    }

    if (!track.url) {
      isPlaying.value = false;
      loadingTrack.value = false;
      return;
    }
    loadingTrack.value = true;
    currentTime.value = startTime || 0;
    duration.value = track.duration;

    const initialVolume = muted.value ? 0 : volume.value;
    let thisBackend: PlaybackBackend | null = null;
    const callbacks: BackendCallbacks = {
      onLoad: (d) => {
        if (backend !== thisBackend) return;
        loadingTrack.value = false;
        if (d > 0) duration.value = d;
      },
      onLoadError: (errCode?: number) => {
        if (backend !== thisBackend) return;
        
        const retries = (track as any)._retries || 0;
        
        if (retries < 2) {
          console.log(`[Player] Load error ${errCode} (retry ${retries + 1}/2), attempting to reconnect...`);
          (track as any)._retries = retries + 1;
          const curTime = currentTime.value;
          track.url = ""; // Force refresh URL from API
          void loadCurrent(true, undefined, curTime);
          return;
        }

        console.log(`[Player] Load error ${errCode} after ${retries} retries. Skipping to next.`);
        (track as any)._retries = 0; // Reset for future plays
        loadingTrack.value = false;
        isPlaying.value = false;
        
        // Auto-skip to the next track on persistent failure
        if (index.value + 1 < queue.value.length) {
           import("@/stores/ui").then(({ useUIStore }) => {
             useUIStore().notify(`Не удалось загрузить трек. Переключаем на следующий...`, "error");
           });
           next();
        } else {
           import("@/stores/ui").then(({ useUIStore }) => {
             useUIStore().notify(`Не удалось загрузить трек`, "error");
           });
        }
      },
      onPlay: () => {
        if (backend !== thisBackend) return;
        isPlaying.value = true;
        startTick();
        if (prefetchTimeout) window.clearTimeout(prefetchTimeout);
        prefetchTimeout = window.setTimeout(() => {
          void prefetchNextTrack();
        }, 100);

        if (scrobbleTimeout) window.clearTimeout(scrobbleTimeout);
        scrobbleTimeout = window.setTimeout(() => {
          const t = current.value;
          if (t && scrobbledTrackId !== t.id) {
            scrobbledTrackId = t.id;
            // Send full duration to register in "Recent"
            const dur = Math.round(t.duration || duration.value || 0);
            api.trackEvent("play", t.id, t.owner_id, playbackUuid || 0, dur).catch(() => {});
          }
        }, 5000);
      },
      onPause: () => {
        if (scrobbleTimeout) window.clearTimeout(scrobbleTimeout);
        if (backend !== thisBackend) return;
        isPlaying.value = false;
      },
      onEnd: () => {
        if (backend !== thisBackend) return;
        handleEnd();
      },
    };

    thisBackend = isHlsUrl(track.url)
      ? createHlsBackend(track.url, initialVolume, callbacks, eq, startTime)
      : createHtml5Backend(track.url, initialVolume, callbacks, eq);
    backend = thisBackend;

    if (startTime && startTime > 0) {
      // Modern browsers handle this synchronously before loadedmetadata
      backend.seek(startTime);
    }

    if (autoPlay) {
      void eq.resumeContext();
      const settings = useSettingsStore();
      if (settings.fadeEnabled) {
        backend.fadeIn(settings.fadeDurationMs, initialVolume);
        backend.play();
      } else if (fadeInMs && fadeInMs > 0) {
        backend.fadeIn(fadeInMs, initialVolume);
        backend.play();
      } else {
        backend.play();
      }
    }
  }

  function handleEnd() {
    const track = current.value;
    if (track) {
      const uuid = Math.floor(Math.random() * 1000000000);
      // Send stop event with track duration to register it as fully listened (added to recent)
      void api.trackEvent("stop", track.id, track.owner_id, uuid, track.duration).catch(console.error);
    }

    if (repeat.value === "all") {
      loadCurrent(true);
      return;
    }
    if (repeat.value === "one") {
      if (!hasRepeatedOnce.value) {
        hasRepeatedOnce.value = true;
        loadCurrent(true);
        return;
      }
    }
    if (index.value + 1 < queue.value.length) {
      index.value += 1;
      loadCurrent(true);
    } else {
      isPlaying.value = false;
      stopTick();
    }
  }

  function playQueue(
    tracks: Track[],
    startIndex = 0,
    options: { autoPlay?: boolean; startTime?: number } = { autoPlay: true },
    onNearEnd?: () => Promise<void> | void,
    playlist?: AlbumSummary
  ) {
    currentPlaylist.value = playlist || null;
    originalQueue.value = [...tracks];
    queue.value = shuffle.value ? shuffleArray([...tracks], startIndex) : [...tracks];
    index.value = shuffle.value ? 0 : Math.min(Math.max(0, startIndex), tracks.length - 1);
    nearEndCallback = onNearEnd || null;
    void loadCurrent(options.autoPlay ?? true, undefined, options.startTime);
  }

  function playAtIndex(i: number) {
    if (i < 0 || i >= queue.value.length) return;
    index.value = i;
    void loadCurrent(true);
  }

  function playTrack(track: Track) {
    playQueue([track]);
  }

  function enqueueNext(track: Track) {
    queue.value.splice(index.value + 1, 0, track);
    originalQueue.value = [...queue.value];
  }

  function appendToQueue(track: Track) {
    queue.value.push(track);
    originalQueue.value = [...queue.value];
  }

  function appendTracksToQueue(tracks: Track[]) {
    if (tracks.length === 0) return;
    queue.value.push(...tracks);
    originalQueue.value = [...queue.value];
  }

  function togglePlay() {
    if (!backend) {
      if (current.value) void loadCurrent(true);
      return;
    }
    if (isPlaying.value) {
      pause();
    } else {
      play();
    }
  }

  function play() {
    void eq.resumeContext();
    isPlaying.value = true;
    if (backend) {
      const settings = useSettingsStore();
      if (settings.fadeEnabled) {
        backend.fadeIn(settings.fadeDurationMs, muted.value ? 0 : volume.value);
        backend.play();
      } else {
        backend.setVolume(muted.value ? 0 : volume.value);
        backend.play();
      }
    } else if (!backend && current.value) {
      void loadCurrent(true);
    }
  }

  function pause() {
    if (backend && isPlaying.value) {
      const settings = useSettingsStore();
      isPlaying.value = false;
      if (settings.fadeEnabled) {
        backend.fadeOut(settings.fadeDurationMs, true);
      } else {
        backend.pause();
      }
    }
  }

  function next() {
    if (index.value + 1 < queue.value.length) {
      index.value += 1;
      void loadCurrent(true);
    }
  }

  function prev() {
    if (backend && backend.position() > 3) {
      backend.seek(0);
      return;
    }
    if (index.value > 0) {
      index.value -= 1;
      void loadCurrent(true);
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
    destroyPrefetch();
    queue.value = [];
    originalQueue.value = [];
    index.value = -1;
    duration.value = 0;
    currentTime.value = 0;
    isPlaying.value = false;
    nearEndCallback = null;
    currentPlaylist.value = null;
    scrobbledTrackId = null;
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
      void loadCurrent(isPlaying.value);
    }
  }

  /** Remove every occurrence of a track from the queue (used by "Не нравится"). */
  function removeTrack(target: Pick<Track, "owner_id" | "id">) {
    for (let i = queue.value.length - 1; i >= 0; i -= 1) {
      const t = queue.value[i];
      if (t.id === target.id && t.owner_id === target.owner_id) {
        removeFromQueue(i);
      }
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

  function setQueue(newQueue: Track[], skipShuffle = false) {
    const currentTrack = current.value;
    const filtered = newQueue.filter((t) => t.url);
    
    if (shuffle.value && !skipShuffle) {
      originalQueue.value = [...filtered];
      if (currentTrack) {
        const pinIdx = filtered.findIndex((t) => t.id === currentTrack.id && t.owner_id === currentTrack.owner_id);
        queue.value = shuffleArray(filtered, pinIdx);
        index.value = 0;
      } else {
        queue.value = shuffleArray(filtered, -1);
        index.value = -1;
      }
    } else {
      queue.value = [...filtered];
      if (!shuffle.value) {
        originalQueue.value = [...filtered];
      }
      if (currentTrack) {
        const newIndex = filtered.findIndex((t) => t.id === currentTrack.id && t.owner_id === currentTrack.owner_id);
        if (newIndex !== -1) {
          index.value = newIndex;
        }
      }
    }
  }

  let rpcCleared = false;

  // Discord RPC synchronization
  watch(
    [current, isPlaying, () => settings.discordRpc, () => settings.discordRpcText, () => settings.discordRpcShowTrack],
    ([track, playing, rpcEnabled, customText, rpcShowTrack]) => {
      if (!rpcEnabled || (track && track.owner_id === -999999)) {
        if (!rpcCleared) {
          rpcCleared = true;
          api.clearRpc().catch(() => {});
        }
        return;
      }
      rpcCleared = false;
      
      const payload: any = {
        is_playing: playing,
        custom_text: customText,
      };

      if (track && rpcShowTrack) {
        payload.title = track.title;
        payload.artist = track.main_artists?.[0]?.name || track.artist || "";
        payload.cover_url = track.cover_large || track.cover_medium || track.cover_small;
        payload.duration = track.duration;
        payload.position = Math.floor(currentTime.value);
      }

      api.updateRpc(payload).catch(err => console.error("RPC Update failed", err));
    }
  );

  let playbackUuid: number | null = null;
  let lastTrackId: number | null = null;
  let maxListenedDuration: number = 0;

  watch(currentTime, (newTime) => {
    maxListenedDuration = Math.max(maxListenedDuration, Math.floor(newTime));
  });

  watch(
    [current, isPlaying],
    ([track, playing], [prevTrack, prevPlaying]) => {
      // 1. Смена трека (предыдущий трек выключен или проскипан)
      if (prevTrack && lastTrackId === prevTrack.id && playbackUuid !== null) {
        if (!track || track.id !== prevTrack.id) {
          api.trackEvent("stop", prevTrack.id, prevTrack.owner_id, playbackUuid, maxListenedDuration).catch(() => {});
          playbackUuid = null;
          maxListenedDuration = 0;
        }
      }

      if (!track) return;
      if (track.owner_id === undefined || track.id === undefined || track.id === -1 || track.owner_id === -999999) return;

      // 2. Трек начался с нуля
      if (playing && playbackUuid === null) {
        playbackUuid = Math.floor(Math.random() * 2147483647);
        lastTrackId = track.id;
        maxListenedDuration = Math.floor(currentTime.value);
        api.trackEvent("start", track.id, track.owner_id, playbackUuid).catch(() => {});
      }
      // 3. Трек поставили на паузу
      else if (!playing && prevPlaying && playbackUuid !== null && track.id === prevTrack?.id) {
        api.trackEvent("pause", track.id, track.owner_id, playbackUuid, maxListenedDuration).catch(() => {});
      }
      // 4. Трек сняли с паузы
      else if (playing && !prevPlaying && playbackUuid !== null && track.id === prevTrack?.id) {
        api.trackEvent("play", track.id, track.owner_id, playbackUuid, maxListenedDuration).catch(() => {});
      }
    }
  );

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
    currentPlaylist,
    hasNext,
    hasPrev,
    playQueue,
    playAtIndex,
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
    removeTrack,
    moveInQueue,
    setQueue,
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
