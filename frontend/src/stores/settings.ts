import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

export type ThemeName =
  | "dark"
  | "amoled"
  | "light"
  | "midnight"
  | "forest"
  | "sunset"
  | "mocha";
export type AccentName =
  | "blue"
  | "magenta"
  | "cyan"
  | "green"
  | "orange"
  | "red"
  | "gold"
  | "mint"
  | "lavender"
  | "electric"
  | "coral"
  | "sky"
  | "crimson";

interface PersistedSettings {
  theme: ThemeName;
  accent: AccentName;
  performanceMode: boolean;
  reduceMotion: boolean;
  closeToTray: boolean;
  startMinimized: boolean;
  hardwareAcceleration: boolean;
  autoStart: boolean;
  /**
   * Volume the player boots into on every app start. Runtime volume changes
   * during playback don't overwrite this — they live in the player store only.
   * Stored as a gain value in [0, 1].
   */
  startupVolume: number;
  cacheSize: number; // in MB
  /**
   * When VK doesn't ship a cover for a track, ask the backend to look it up
   * from a non-VK source (iTunes today). The lookup is cached on disk so
   * subsequent renders are instant.
   */
  externalCovers: boolean;
}

const STORAGE_KEY = "vkmp:settings";

const defaults: PersistedSettings = {
  theme: "dark",
  accent: "blue",
  performanceMode: false,
  reduceMotion: false,
  closeToTray: true,
  startMinimized: false,
  hardwareAcceleration: true,
  autoStart: false,
  startupVolume: 0.5,
  cacheSize: 250,
  externalCovers: true,
};

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

export const useSettingsStore = defineStore("settings", () => {
  const initial = load();

  const theme = ref<ThemeName>(initial.theme);
  const accent = ref<AccentName>(initial.accent);
  const performanceMode = ref(initial.performanceMode);
  const reduceMotion = ref(initial.reduceMotion);
  const closeToTray = ref(initial.closeToTray);
  const startMinimized = ref(initial.startMinimized);
  const hardwareAcceleration = ref(initial.hardwareAcceleration);
  const autoStart = ref(initial.autoStart);
  const startupVolume = ref(initial.startupVolume);
  const cacheSize = ref(initial.cacheSize);
  const externalCovers = ref(initial.externalCovers);

  const motionDisabled = computed(() => performanceMode.value || reduceMotion.value);

  function applyToDocument() {
    const html = document.documentElement;
    html.dataset.theme = theme.value;
    html.dataset.accent = accent.value;
    html.dataset.perf = performanceMode.value ? "on" : "off";
    html.dataset.reduceMotion = reduceMotion.value ? "on" : "off";
  }

  function persist() {
    const data: PersistedSettings = {
      theme: theme.value,
      accent: accent.value,
      performanceMode: performanceMode.value,
      reduceMotion: reduceMotion.value,
      closeToTray: closeToTray.value,
      startMinimized: startMinimized.value,
      hardwareAcceleration: hardwareAcceleration.value,
      autoStart: autoStart.value,
      startupVolume: startupVolume.value,
      cacheSize: cacheSize.value,
      externalCovers: externalCovers.value,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignore quota errors
    }
  }

  watch(
    [
      theme,
      accent,
      performanceMode,
      reduceMotion,
      closeToTray,
      startMinimized,
      hardwareAcceleration,
      autoStart,
      startupVolume,
      cacheSize,
      externalCovers,
    ],
    () => {
      applyToDocument();
      persist();
    },
    { immediate: true, flush: "post" }
  );

  async function syncAutoStartWithOS() {
    if (!window.vkmp) return;
    try {
      const current = await window.vkmp.getAutoStart();
      autoStart.value = current;
    } catch {
      // ignore
    }
  }

  async function setAutoStart(enabled: boolean) {
    if (!window.vkmp) {
      autoStart.value = enabled;
      return;
    }
    const ok = await window.vkmp.setAutoStart(enabled);
    if (ok) autoStart.value = enabled;
  }

  function reset() {
    theme.value = defaults.theme;
    accent.value = defaults.accent;
    performanceMode.value = defaults.performanceMode;
    reduceMotion.value = defaults.reduceMotion;
    closeToTray.value = defaults.closeToTray;
    startMinimized.value = defaults.startMinimized;
    hardwareAcceleration.value = defaults.hardwareAcceleration;
    autoStart.value = defaults.autoStart;
    startupVolume.value = defaults.startupVolume;
    cacheSize.value = defaults.cacheSize;
    externalCovers.value = defaults.externalCovers;
  }

  return {
    theme,
    accent,
    performanceMode,
    reduceMotion,
    closeToTray,
    startMinimized,
    hardwareAcceleration,
    autoStart,
    startupVolume,
    cacheSize,
    externalCovers,
    motionDisabled,
    applyToDocument,
    syncAutoStartWithOS,
    setAutoStart,
    reset,
  };
});
