import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { getBgImage, saveBgImage, clearBgImage } from "@/utils/bgStorage";
import { http } from "@/api/client";

export type ThemeName =
  | "dark"
  | "amoled"
  | "light"
  | "midnight"
  | "forest"
  | "sunset"
  | "mocha"
  | "spotify"
  | "spotify-cover"
  | "custom"
  | "night";
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
export type DragHandleStyle = "dots" | "lines" | "grip";
export type RouterAnimation = "fade" | "slide" | "zoom" | "none";

export interface SidebarItemSetting {
  id: string;
  visible: boolean;
}

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

const PREDEFINED_ACCENTS: Record<string, string> = {
  blue: "#1a8cff",
  magenta: "#c930ff",
  cyan: "#16d1cf",
  green: "#2bc48a",
  orange: "#ff8c1a",
  red: "#ff3b3b",
  gold: "#ffc24a",
  mint: "#4dd4ac",
  lavender: "#b88dff",
  electric: "#c4ff3a",
  coral: "#ff7766",
  sky: "#5cd0ff",
  crimson: "#ff2f7a",
};

function hexToRgb(hex: string) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  return { r, g, b };
}

function getLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

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
  autoUpdateCheck: boolean;
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
  fadeEnabled: boolean;
  fadeDurationMs: number;
  autoScrollQueue: boolean;
  prefetchEnabled: boolean;
  discordRpc: boolean;
  discordRpcText: string;
  discordRpcShowTrack: boolean;
  dragHandleStyle: DragHandleStyle;
  routerAnimation: RouterAnimation;
  fontSizeScale: number;
  letterSpacing: number;
  customBgEnabled: boolean;
  customBgUrl: string;
  customBgBlur: number;
  customBgZoom: number;
  customBgPosX: number;
  customBgPosY: number;
  customBgBrightness: number;
  coverBgBlur: number;
  homeCardsBrightness: number;
  homeCardsBrightnessAuto: boolean;
  homeCardsBrightnessDimmed: number;
  homeCardsBrightnessTimeStart: string;
  homeCardsBrightnessTimeEnd: string;
  sidebarItems: SidebarItemSetting[];
  trackItems: SidebarItemSetting[];
  iconSet: "line" | "flat" | "rounded";
  mixMood: string;
  mixFamiliarity: string;
  mixLanguage: string;
}

const STORAGE_KEY = "vkmp:settings";

const defaults: PersistedSettings = {
  theme: "spotify-cover",
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
  autoUpdateCheck: true,
  startupVolume: 0.5,
  cacheSize: 250,
  externalCovers: true,
  crossfade: true,
  crossfadeDuration: 2,
  fadeEnabled: true,
  fadeDurationMs: 500,
  autoScrollQueue: true,
  prefetchEnabled: true,
  discordRpc: false,
  discordRpcText: "Слушает музыку",
  discordRpcShowTrack: true,
  dragHandleStyle: "lines",
  routerAnimation: "slide",
  fontSizeScale: 1.0,
  letterSpacing: 0,
  customBgEnabled: false,
  customBgUrl: "",
  customBgBlur: 0,
  customBgZoom: 1.0,
  customBgPosX: 50,
  customBgPosY: 50,
  customBgBrightness: 100,
  coverBgBlur: 90,
  homeCardsBrightness: 100,
  homeCardsBrightnessAuto: false,
  homeCardsBrightnessDimmed: 50,
  homeCardsBrightnessTimeStart: "22:00",
  homeCardsBrightnessTimeEnd: "06:00",
  sidebarItems: [
    { id: "home", visible: true },
    { id: "library", visible: true },
    { id: "friends", visible: true },
    { id: "search", visible: true },
    { id: "queue", visible: true },
    { id: "settings", visible: true },
  ],
  trackItems: [
    { id: "library", visible: true },
    { id: "uncensored", visible: true },
    { id: "similar", visible: true },
    { id: "queue", visible: true },
  ],
  iconSet: "rounded",
  mixMood: "any",
  mixFamiliarity: "any",
  mixLanguage: "any",
};

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<PersistedSettings>;
    
    // Merge sidebar items to ensure none is lost during updates
    if (parsed.sidebarItems) {
      const defaultIds = defaults.sidebarItems.map(item => item.id);
      const loadedItems = parsed.sidebarItems.filter(item => defaultIds.includes(item.id));
      const loadedIds = loadedItems.map(item => item.id);
      const missingItems = defaults.sidebarItems.filter(item => !loadedIds.includes(item.id));
      parsed.sidebarItems = [...loadedItems, ...missingItems];
    }
    
    // Merge track items to ensure none is lost during updates
    if (parsed.trackItems) {
      const defaultIds = defaults.trackItems.map(item => item.id);
      const loadedItems = parsed.trackItems.filter(item => defaultIds.includes(item.id));
      const loadedIds = loadedItems.map(item => item.id);
      const missingItems = defaults.trackItems.filter(item => !loadedIds.includes(item.id));
      parsed.trackItems = [...loadedItems, ...missingItems];
    }
    
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

function isTimeBetween(start: string, end: string): boolean {
  if (!start || !end) return false;
  const startParts = start.split(":");
  const endParts = end.split(":");
  if (startParts.length !== 2 || endParts.length !== 2) return false;

  const startH = parseInt(startParts[0], 10);
  const startM = parseInt(startParts[1], 10);
  const endH = parseInt(endParts[0], 10);
  const endM = parseInt(endParts[1], 10);

  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return false;

  const now = new Date();
  const currentH = now.getHours();
  const currentM = now.getMinutes();

  const currentTime = currentH * 60 + currentM;
  const startTime = startH * 60 + startM;
  const endTime = endH * 60 + endM;

  if (startTime < endTime) {
    return currentTime >= startTime && currentTime < endTime;
  } else {
    return currentTime >= startTime || currentTime < endTime;
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
  const autoUpdateCheck = ref(initial.autoUpdateCheck ?? true);
  const startupVolume = ref(initial.startupVolume);
  const cacheSize = ref(initial.cacheSize);
  const externalCovers = ref(initial.externalCovers);
  const crossfade = ref(initial.crossfade);
  const crossfadeDuration = ref(initial.crossfadeDuration);
  const fadeEnabled = ref(initial.fadeEnabled ?? true);
  const fadeDurationMs = ref(initial.fadeDurationMs ?? 500);
  const autoScrollQueue = ref(initial.autoScrollQueue ?? defaults.autoScrollQueue);
  const dragHandleStyle = ref<DragHandleStyle>(initial.dragHandleStyle ?? defaults.dragHandleStyle);
  const routerAnimation = ref<RouterAnimation>(initial.routerAnimation ?? defaults.routerAnimation);
  const fontSizeScale = ref(initial.fontSizeScale ?? defaults.fontSizeScale);
  const letterSpacing = ref(initial.letterSpacing ?? defaults.letterSpacing);
  const prefetchEnabled = ref(initial.prefetchEnabled ?? defaults.prefetchEnabled);
  const discordRpc = ref(initial.discordRpc);
  const discordRpcText = ref(initial.discordRpcText);
  const discordRpcShowTrack = ref(initial.discordRpcShowTrack ?? true);
  const customBgEnabled = ref(initial.customBgEnabled ?? false);
  const customBgUrl = ref(initial.customBgUrl ?? "");
  const customBgBlur = ref(initial.customBgBlur ?? 0);
  const customBgZoom = ref(initial.customBgZoom ?? 1.0);
  const customBgPosX = ref(initial.customBgPosX ?? 50);
  const customBgPosY = ref(initial.customBgPosY ?? 50);
  const customBgBrightness = ref(initial.customBgBrightness ?? 100);
  const coverBgBlur = ref(initial.coverBgBlur ?? 90);
  const sidebarItems = ref<SidebarItemSetting[]>(initial.sidebarItems ?? defaults.sidebarItems);
  const trackItems = ref<SidebarItemSetting[]>(initial.trackItems ?? defaults.trackItems);
  const iconSet = ref<"line" | "flat" | "rounded">(initial.iconSet ?? defaults.iconSet);

  const mixMood = ref(initial.mixMood ?? defaults.mixMood);
  const mixFamiliarity = ref(initial.mixFamiliarity ?? defaults.mixFamiliarity);
  const mixLanguage = ref(initial.mixLanguage ?? defaults.mixLanguage);

  const homeCardsBrightness = ref(initial.homeCardsBrightness ?? 100);
  const homeCardsBrightnessAuto = ref(initial.homeCardsBrightnessAuto ?? false);
  const homeCardsBrightnessDimmed = ref(initial.homeCardsBrightnessDimmed ?? 50);
  const homeCardsBrightnessTimeStart = ref(initial.homeCardsBrightnessTimeStart ?? "22:00");
  const homeCardsBrightnessTimeEnd = ref(initial.homeCardsBrightnessTimeEnd ?? "06:00");

  const currentHomeCardsBrightness = ref(100);

  function updateAppliedBrightness() {
    if (homeCardsBrightnessAuto.value) {
      if (isTimeBetween(homeCardsBrightnessTimeStart.value, homeCardsBrightnessTimeEnd.value)) {
        currentHomeCardsBrightness.value = homeCardsBrightnessDimmed.value;
      } else {
        currentHomeCardsBrightness.value = homeCardsBrightness.value;
      }
    } else {
      currentHomeCardsBrightness.value = homeCardsBrightness.value;
    }
  }

  // Initial check
  updateAppliedBrightness();

  // Schedule timer/interval
  if (typeof window !== "undefined") {
    window.setInterval(updateAppliedBrightness, 10000);
  }

  watch(
    [
      homeCardsBrightness,
      homeCardsBrightnessAuto,
      homeCardsBrightnessDimmed,
      homeCardsBrightnessTimeStart,
      homeCardsBrightnessTimeEnd,
    ],
    () => {
      updateAppliedBrightness();
    }
  );

  const customBgCachedUrl = ref("");

  watch(theme, (newTheme) => {
    customBgEnabled.value = (newTheme === "custom");
  }, { immediate: true });

  async function loadCachedBg() {
    try {
      const blob = await getBgImage();
      if (blob) {
        if (customBgCachedUrl.value) {
          URL.revokeObjectURL(customBgCachedUrl.value);
        }
        customBgCachedUrl.value = URL.createObjectURL(blob);
      } else {
        customBgCachedUrl.value = "";
      }
    } catch (err) {
      console.error("Failed to load cached background image:", err);
    }
  }

  async function setCustomBgFile(file: File) {
    try {
      await saveBgImage(file);
      customBgUrl.value = "";
      customBgBlur.value = 0;
      customBgZoom.value = 1.0;
      customBgPosX.value = 50;
      customBgPosY.value = 50;
      customBgBrightness.value = 100;
      await loadCachedBg();
      persist();
    } catch (err) {
      console.error("Failed to save local background image:", err);
      throw err;
    }
  }

  async function setCustomBgUrl(url: string) {
    try {
      let response: Response;
      try {
        response = await fetch(url);
      } catch {
        const proxyUrl = `${http.defaults.baseURL}/art/proxy?url=${encodeURIComponent(url)}`;
        response = await fetch(proxyUrl);
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      await saveBgImage(blob);
      customBgUrl.value = url;
      customBgBlur.value = 0;
      customBgZoom.value = 1.0;
      customBgPosX.value = 50;
      customBgPosY.value = 50;
      customBgBrightness.value = 100;
      await loadCachedBg();
      persist();
    } catch (err) {
      console.error("Failed to save remote background image:", err);
      throw err;
    }
  }

  async function clearCustomBg() {
    try {
      await clearBgImage();
      customBgUrl.value = "";
      if (customBgCachedUrl.value) {
        URL.revokeObjectURL(customBgCachedUrl.value);
      }
      customBgCachedUrl.value = "";
      persist();
    } catch (err) {
      console.error("Failed to clear background image:", err);
    }
  }

  // Load immediately
  loadCachedBg();

  const motionDisabled = computed(() => performanceMode.value || reduceMotion.value);

  function applyToDocument() {
    const html = document.documentElement;
    html.dataset.theme = theme.value;
    html.dataset.style = style.value;
    html.dataset.accent = customAccent.value ? "custom" : accent.value;
    html.dataset.perf = performanceMode.value ? "on" : "off";
    html.dataset.reduceMotion = reduceMotion.value ? "on" : "off";
    html.dataset.customBg = (customBgEnabled.value && !!customBgUrl.value) ? "on" : "off";
    html.style.setProperty("--font-family", `"${fontFamily.value || 'Nunito'}", sans-serif`);
    html.style.setProperty("--font-scale", fontSizeScale.value.toString());
    html.style.setProperty("--letter-spacing", `${letterSpacing.value}px`);
    html.style.setProperty("--custom-bg-blur", `${customBgBlur.value}px`);
    html.style.setProperty("--custom-bg-zoom", customBgZoom.value.toString());
    html.style.setProperty("--custom-bg-pos-x", `${customBgPosX.value}%`);
    html.style.setProperty("--custom-bg-pos-y", `${customBgPosY.value}%`);
    html.style.setProperty("--custom-bg-brightness", `${customBgBrightness.value}%`);
    html.style.setProperty("--home-cards-brightness", `${currentHomeCardsBrightness.value / 100}`);

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

    const currentAccentHex = customAccent.value 
      ? customAccentColor1.value 
      : PREDEFINED_ACCENTS[accent.value] || "#1a8cff";
    
    const lum = getLuminance(currentAccentHex);
    html.style.setProperty("--accent-text", lum >= 160 ? "#000000" : "#ffffff");
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
      autoUpdateCheck: autoUpdateCheck.value,
      startupVolume: startupVolume.value,
      cacheSize: cacheSize.value,
      externalCovers: externalCovers.value,
      crossfade: crossfade.value,
      crossfadeDuration: crossfadeDuration.value,
      fadeEnabled: fadeEnabled.value,
      fadeDurationMs: fadeDurationMs.value,
      autoScrollQueue: autoScrollQueue.value,
      dragHandleStyle: dragHandleStyle.value,
      routerAnimation: routerAnimation.value,
      fontSizeScale: fontSizeScale.value,
      letterSpacing: letterSpacing.value,
      prefetchEnabled: prefetchEnabled.value,
      discordRpc: discordRpc.value,
      discordRpcText: discordRpcText.value,
      discordRpcShowTrack: discordRpcShowTrack.value,
      customBgEnabled: customBgEnabled.value,
      customBgUrl: customBgUrl.value,
      customBgBlur: customBgBlur.value,
      customBgZoom: customBgZoom.value,
      customBgPosX: customBgPosX.value,
      customBgPosY: customBgPosY.value,
      customBgBrightness: customBgBrightness.value,
      coverBgBlur: coverBgBlur.value,
      homeCardsBrightness: homeCardsBrightness.value,
      homeCardsBrightnessAuto: homeCardsBrightnessAuto.value,
      homeCardsBrightnessDimmed: homeCardsBrightnessDimmed.value,
      homeCardsBrightnessTimeStart: homeCardsBrightnessTimeStart.value,
      homeCardsBrightnessTimeEnd: homeCardsBrightnessTimeEnd.value,
      sidebarItems: sidebarItems.value,
      trackItems: trackItems.value,
      iconSet: iconSet.value,
      mixMood: mixMood.value,
      mixFamiliarity: mixFamiliarity.value,
      mixLanguage: mixLanguage.value,
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
      autoUpdateCheck,
      startupVolume,
      cacheSize,
      externalCovers,
      crossfade,
      crossfadeDuration,
      autoScrollQueue,
      dragHandleStyle,
      routerAnimation,
      fontSizeScale,
      letterSpacing,
      prefetchEnabled,
      discordRpc,
      discordRpcText,
      discordRpcShowTrack,
      customBgEnabled,
      customBgUrl,
      customBgBlur,
      customBgZoom,
      customBgPosX,
      customBgPosY,
      customBgBrightness,
      coverBgBlur,
      homeCardsBrightness,
      homeCardsBrightnessAuto,
      homeCardsBrightnessDimmed,
      homeCardsBrightnessTimeStart,
      homeCardsBrightnessTimeEnd,
      currentHomeCardsBrightness,
      sidebarItems,
      trackItems,
      iconSet,
      mixMood,
      mixFamiliarity,
      mixLanguage,
    ],
    () => {
      applyToDocument();
      persist();
    },
    { immediate: true, flush: "post", deep: true }
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

  async function setAutoStart(enabled: boolean, hidden: boolean) {
    if (!window.vkmp) {
      autoStart.value = enabled;
      return;
    }
    const ok = await window.vkmp.setAutoStart(enabled, hidden);
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
    autoUpdateCheck.value = defaults.autoUpdateCheck;
    startupVolume.value = defaults.startupVolume;
    cacheSize.value = defaults.cacheSize;
    externalCovers.value = defaults.externalCovers;
    crossfade.value = defaults.crossfade;
    crossfadeDuration.value = defaults.crossfadeDuration;
    autoScrollQueue.value = defaults.autoScrollQueue;
    dragHandleStyle.value = defaults.dragHandleStyle;
    routerAnimation.value = defaults.routerAnimation;
    fontSizeScale.value = defaults.fontSizeScale;
    letterSpacing.value = defaults.letterSpacing;
    prefetchEnabled.value = defaults.prefetchEnabled;
    discordRpc.value = defaults.discordRpc;
    discordRpcText.value = defaults.discordRpcText;
    discordRpcShowTrack.value = defaults.discordRpcShowTrack;
    customBgEnabled.value = defaults.customBgEnabled;
    customBgUrl.value = defaults.customBgUrl;
    customBgBlur.value = defaults.customBgBlur;
    customBgZoom.value = defaults.customBgZoom;
    customBgPosX.value = defaults.customBgPosX;
    customBgPosY.value = defaults.customBgPosY;
    customBgBrightness.value = defaults.customBgBrightness;
    coverBgBlur.value = defaults.coverBgBlur;
    homeCardsBrightness.value = defaults.homeCardsBrightness;
    homeCardsBrightnessAuto.value = defaults.homeCardsBrightnessAuto;
    homeCardsBrightnessDimmed.value = defaults.homeCardsBrightnessDimmed;
    homeCardsBrightnessTimeStart.value = defaults.homeCardsBrightnessTimeStart;
    homeCardsBrightnessTimeEnd.value = defaults.homeCardsBrightnessTimeEnd;
    sidebarItems.value = defaults.sidebarItems.map(item => ({ ...item }));
    trackItems.value = defaults.trackItems.map(item => ({ ...item }));
    iconSet.value = defaults.iconSet;
    mixMood.value = defaults.mixMood;
    mixFamiliarity.value = defaults.mixFamiliarity;
    mixLanguage.value = defaults.mixLanguage;
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
    autoUpdateCheck,
    startupVolume,
    cacheSize,
    externalCovers,
    crossfade,
    crossfadeDuration,
    fadeEnabled,
    fadeDurationMs,
    autoScrollQueue,
    dragHandleStyle,
    routerAnimation,
    fontSizeScale,
    letterSpacing,
    prefetchEnabled,
    discordRpc,
    discordRpcText,
    discordRpcShowTrack,
    customBgEnabled,
    customBgUrl,
    customBgBlur,
    customBgZoom,
    customBgPosX,
    customBgPosY,
    customBgBrightness,
    coverBgBlur,
    homeCardsBrightness,
    homeCardsBrightnessAuto,
    homeCardsBrightnessDimmed,
    homeCardsBrightnessTimeStart,
    homeCardsBrightnessTimeEnd,
    currentHomeCardsBrightness,
    customBgCachedUrl,
    setCustomBgFile,
    setCustomBgUrl,
    clearCustomBg,
    motionDisabled,
    applyToDocument,
    syncAutoStartWithOS,
    setAutoStart,
    reset,
    sidebarItems,
    trackItems,
    iconSet,
    mixMood,
    mixFamiliarity,
    mixLanguage,
  };
});
