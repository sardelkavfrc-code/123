import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { Howl } from "howler";
import type { Track } from "@/api/types";
import { useSettingsStore } from "./settings";

export type RepeatMode = "off" | "all" | "one";

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

  let sound: Howl | null = null;
  let tickHandle: number | null = null;

  const current = computed<Track | null>(() => {
    if (index.value < 0 || index.value >= queue.value.length) return null;
    return queue.value[index.value];
  });

  const hasNext = computed(() => index.value + 1 < queue.value.length || repeat.value === "all");
  const hasPrev = computed(() => index.value > 0 || repeat.value === "all");

  watch(volume, (v) => {
    settings.volume = v;
    if (sound) sound.volume(muted.value ? 0 : v);
  });
  watch(muted, (m) => {
    if (sound) sound.volume(m ? 0 : volume.value);
  });

  function startTick() {
    stopTick();
    tickHandle = window.setInterval(() => {
      if (sound && sound.playing()) {
        currentTime.value = sound.seek() as number;
      }
    }, 250);
  }

  function stopTick() {
    if (tickHandle !== null) {
      window.clearInterval(tickHandle);
      tickHandle = null;
    }
  }

  function destroySound() {
    stopTick();
    if (sound) {
      sound.off();
      sound.stop();
      sound.unload();
      sound = null;
    }
  }

  function loadCurrent(autoPlay: boolean) {
    destroySound();
    const track = current.value;
    if (!track || !track.url) {
      isPlaying.value = false;
      return;
    }
    loadingTrack.value = true;
    currentTime.value = 0;
    duration.value = track.duration;
    sound = new Howl({
      src: [track.url],
      html5: true,
      volume: muted.value ? 0 : volume.value,
      onload: () => {
        loadingTrack.value = false;
        if (sound) duration.value = sound.duration();
      },
      onloaderror: () => {
        loadingTrack.value = false;
        isPlaying.value = false;
      },
      onplay: () => {
        isPlaying.value = true;
        startTick();
      },
      onpause: () => {
        isPlaying.value = false;
      },
      onstop: () => {
        isPlaying.value = false;
        currentTime.value = 0;
        stopTick();
      },
      onend: () => {
        handleEnd();
      },
    });
    if (autoPlay) sound.play();
  }

  function handleEnd() {
    if (repeat.value === "one") {
      if (sound) {
        sound.seek(0);
        sound.play();
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
    if (!sound) {
      if (current.value) loadCurrent(true);
      return;
    }
    if (sound.playing()) {
      sound.pause();
    } else {
      sound.play();
    }
  }

  function play() {
    if (!sound && current.value) loadCurrent(true);
    sound?.play();
  }

  function pause() {
    sound?.pause();
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
    if (sound && (sound.seek() as number) > 3) {
      sound.seek(0);
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
    if (sound) {
      sound.seek(seconds);
      currentTime.value = seconds;
    }
  }

  function toggleShuffle() {
    shuffle.value = !shuffle.value;
    const playing = current.value;
    if (shuffle.value) {
      const reordered = playing ? shuffleArray(originalQueue.value, originalQueue.value.indexOf(playing)) : shuffleArray(originalQueue.value, 0);
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
    destroySound();
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
