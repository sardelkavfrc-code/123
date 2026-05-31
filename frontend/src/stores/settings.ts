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

export const FONT_OPTIONS = [
  "Nunito",
  "Roboto",
  "Montserrat",
  "Poppins",
  "Raleway",
  "Fira Sans",
  "Manrope"
] as const;

export type FontName = typeof FONT_OPTIONS[number];

interface PersistedSettings {
  theme: ThemeName;
  accent: AccentName;
  fontFamily: string;
  performanceMode: boolean;
  reduceMotion: boolean;
  closeToTray: boolean;
  startMinimized: boolean;
  startSidebarCollapsed: boolean;
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
  crossfade: boolean;
  crossfadeDuration: number;
}

const STORAGE_KEY = "vkmp:settings";

const defaults: PersistedSettings = {
  theme: "dark",
  accent: "blue",
  fontFamily: "Nunito",
  performanceMode: false,
  reduceMotion: false,
  closeToTray: true,
  startMinimized: false,
  startSidebarCollapsed: false,
  hardwareAcceleration: true,
  autoStart: false,
  startupVolume: 0.5,
  cacheSize: 250,
  externalCovers: true,
  crossfade: true,
  crossfadeDuration: 3,
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
  const fontFamily = ref(initial.fontFamily);
  const performanceMode = ref(initial.performanceMode);
  const reduceMotion = ref(initial.reduceMotion);
  const closeToTray = ref(initial.closeToTray);
  const startMinimized = ref(initial.startMinimized);
  const startSidebarCollapsed = ref(initial.startSidebarCollapsed);
  const hardwareAcceleration = ref(initial.hardwareAcceleration);
  const autoStart = ref(initial.autoStart);
  const startupVolume = ref(initial.startupVolume);
  const cacheSize = ref(initial.cacheSize);
  const externalCovers = ref(initial.externalCovers);
  const crossfade = ref(initial.crossfade);
  const crossfadeDuration = ref(initial.crossfadeDuration);

  const motionDisabled = computed(() => performanceMode.value || reduceMotion.value);

  function applyToDocument() {
    const html = document.documentElement;
    html.dataset.theme = theme.value;
    html.dataset.accent = accent.value;
    html.dataset.perf = performanceMode.value ? "on" : "off";
    html.dataset.reduceMotion = reduceMotion.value ? "on" : "off";
    html.style.setProperty("--font-family", `"${fontFamily.value || 'Nunito'}", sans-serif`);
  }

  function persist() {
    const data: PersistedSettings = {
      theme: theme.value,
      accent: accent.value,
      fontFamily: fontFamily.value,
      performanceMode: performanceMode.value,
      reduceMotion: reduceMotion.value,
      closeToTray: closeToTray.value,
      startMinimized: startMinimized.value,
      startSidebarCollapsed: startSidebarCollapsed.value,
      hardwareAcceleration: hardwareAcceleration.value,
      autoStart: autoStart.value,
      startupVolume: startupVolume.value,
      cacheSize: cacheSize.value,
      externalCovers: externalCovers.value,
      crossfade: crossfade.value,
      crossfadeDuration: crossfadeDuration.value,
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
      fontFamily,
      performanceMode,
      reduceMotion,
      closeToTray,
      startMinimized,
      startSidebarCollapsed,
      hardwareAcceleration,
      autoStart,
      startupVolume,
      cacheSize,
      externalCovers,
      crossfade,
      crossfadeDuration,
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
    startSidebarCollapsed.value = defaults.startSidebarCollapsed;
    hardwareAcceleration.value = defaults.hardwareAcceleration;
    autoStart.value = defaults.autoStart;
    startupVolume.value = defaults.startupVolume;
    cacheSize.value = defaults.cacheSize;
    externalCovers.value = defaults.externalCovers;
    crossfade.value = defaults.crossfade;
    crossfadeDuration.value = defaults.crossfadeDuration;
  }

  return {
    theme,
    accent,
    fontFamily,
    performanceMode,
    reduceMotion,
    closeToTray,
    startMinimized,
    startSidebarCollapsed,
    hardwareAcceleration,
    autoStart,
    startupVolume,
    cacheSize,
    externalCovers,
    crossfade,
    crossfadeDuration,
    motionDisabled,
    applyToDocument,
    syncAutoStartWithOS,
    setAutoStart,
    reset,
  };
});
