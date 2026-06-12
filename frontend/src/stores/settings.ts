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
  | "crimson"
  | "custom";

export type StyleName = "default" | "matte" | "flat" | "noise" | "glow";
export type CustomAccentType = "solid" | "gradient";

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
  style: StyleName;
  customAccent: boolean;
  customAccentType: CustomAccentType;
  customAccentColor1: string;
  customAccentColor2: string;
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
  autoScrollQueue: boolean;
  discordRpc: boolean;
  discordRpcText: string;
}

const STORAGE_KEY = "vkmp:settings";

const defaults: PersistedSettings = {
  theme: "dark",
  accent: "blue",
  style: "default",
  customAccent: false,
  customAccentType: "gradient",
  customAccentColor1: "#1a8cff",
  customAccentColor2: "#6d3cff",
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
  crossfadeDuration: 2,
  autoScrollQueue: true,
  discordRpc: true,
  discordRpcText: "Слушает музыку",
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
  const style = ref<StyleName>(initial.style || "default");
  const customAccent = ref<boolean>(initial.customAccent || false);
  const customAccentType = ref<CustomAccentType>(initial.customAccentType || "gradient");
  const customAccentColor1 = ref<string>(initial.customAccentColor1 || "#1a8cff");
  const customAccentColor2 = ref<string>(initial.customAccentColor2 || "#6d3cff");
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
  const autoScrollQueue = ref(initial.autoScrollQueue ?? true);
  const discordRpc = ref(initial.discordRpc);
  const discordRpcText = ref(initial.discordRpcText);

  const motionDisabled = computed(() => performanceMode.value || reduceMotion.value);

  function applyToDocument() {
    const html = document.documentElement;
    html.dataset.theme = theme.value;
    html.dataset.style = style.value;
    html.dataset.accent = customAccent.value ? "custom" : accent.value;
    html.dataset.perf = performanceMode.value ? "on" : "off";
    html.dataset.reduceMotion = reduceMotion.value ? "on" : "off";
    html.style.setProperty("--font-family", `"${fontFamily.value || 'Nunito'}", sans-serif`);

    if (customAccent.value) {
      if (customAccentType.value === "solid") {
        html.style.setProperty("--accent-1", customAccentColor1.value);
        html.style.setProperty("--accent-2", customAccentColor1.value);
        html.style.setProperty("--accent-3", customAccentColor1.value);
      } else {
        html.style.setProperty("--accent-1", customAccentColor1.value);
        html.style.setProperty("--accent-2", customAccentColor2.value);
        html.style.setProperty("--accent-3", customAccentColor2.value);
      }
    } else {
      html.style.removeProperty("--accent-1");
      html.style.removeProperty("--accent-2");
      html.style.removeProperty("--accent-3");
    }
  }

  function persist() {
    const data: PersistedSettings = {
      theme: theme.value,
      accent: accent.value,
      style: style.value,
      customAccent: customAccent.value,
      customAccentType: customAccentType.value,
      customAccentColor1: customAccentColor1.value,
      customAccentColor2: customAccentColor2.value,
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
      autoScrollQueue: autoScrollQueue.value,
      discordRpc: discordRpc.value,
      discordRpcText: discordRpcText.value,
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
      style,
      customAccent,
      customAccentType,
      customAccentColor1,
      customAccentColor2,
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
      autoScrollQueue,
      discordRpc,
      discordRpcText,
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
    style.value = defaults.style;
    customAccent.value = defaults.customAccent;
    customAccentType.value = defaults.customAccentType;
    customAccentColor1.value = defaults.customAccentColor1;
    customAccentColor2.value = defaults.customAccentColor2;
    fontFamily.value = defaults.fontFamily;
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
    autoScrollQueue.value = defaults.autoScrollQueue;
    discordRpc.value = defaults.discordRpc;
    discordRpcText.value = defaults.discordRpcText;
  }

  return {
    theme,
    accent,
    style,
    customAccent,
    customAccentType,
    customAccentColor1,
    customAccentColor2,
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
    autoScrollQueue,
    discordRpc,
    discordRpcText,
    motionDisabled,
    applyToDocument,
    syncAutoStartWithOS,
    setAutoStart,
    reset,
  };
});
