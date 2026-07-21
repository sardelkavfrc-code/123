<script setup lang="ts">
import { computed, ref, onMounted, nextTick, watch } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useSettingsStore, type AccentName, type ThemeName, type StyleName, FONT_OPTIONS } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import EqualizerModal from "@/components/EqualizerModal.vue";

const settings = useSettingsStore();
const auth = useAuthStore();
const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();
const router = useRouter();

const {
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
  autoScrollQueue,
  prefetchEnabled,
  discordRpc,
  discordRpcText,
  discordRpcShowTrack,
  dragHandleStyle,
  routerAnimation,
  fontSizeScale,
  letterSpacing,
  customBgUrl,
  customBgBlur,
  customBgZoom,
  customBgPosX,
  customBgPosY,
  customBgBrightness,
  customBgCachedUrl,
  coverBgBlur,
  homeCardsBrightness,
  homeCardsBrightnessAuto,
  homeCardsBrightnessDimmed,
  homeCardsBrightnessTimeStart,
  homeCardsBrightnessTimeEnd,
  iconSet,
} = storeToRefs(settings);

const crossfade = computed({
  get: () => settings.crossfade,
  set: (v) => (settings.crossfade = v),
});
const crossfadeDuration = computed({
  get: () => settings.crossfadeDuration,
  set: (v) => (settings.crossfadeDuration = v),
});
const fadeEnabled = computed({
  get: () => settings.fadeEnabled,
  set: (v) => (settings.fadeEnabled = v),
});
const fadeDurationMs = computed({
  get: () => settings.fadeDurationMs,
  set: (v) => (settings.fadeDurationMs = v),
});

const activeTab = ref<"appearance" | "playback" | "app" | "account">("appearance");
const tabs = [
  { id: "appearance", label: "Внешний вид" },
  { id: "playback", label: "Воспроизведение" },
  { id: "app", label: "Приложение" },
  { id: "account", label: "Аккаунт" },
] as const;

function volumeToGain(x: number): number {
  const clamped = Math.max(0, Math.min(1, x));
  return clamped * clamped * clamped;
}

const startupVolumePct = computed({
  get: () => {
    const pos = Math.cbrt(Math.max(0, Math.min(1, startupVolume.value)));
    return Math.round(pos * 100);
  },
  set: (v: number) => {
    startupVolume.value = volumeToGain(v / 100);
  },
});

const themes: { value: ThemeName; label: string; preview: string }[] = [
  { value: "dark", label: "Тёмная", preview: "linear-gradient(135deg, #161922, #0b0c10)" },
  { value: "amoled", label: "AMOLED", preview: "linear-gradient(135deg, #050507, #000000)" },
  { value: "light", label: "Светлая", preview: "linear-gradient(135deg, #ffffff, #e3e6ef)" },
  { value: "midnight", label: "Полночь", preview: "linear-gradient(135deg, #221d4e, #0a0820)" },
  { value: "forest", label: "Лес", preview: "linear-gradient(135deg, #19302a, #0a1410)" },
  { value: "sunset", label: "Закат", preview: "linear-gradient(135deg, #3d251f, #1a0d0b)" },
  { value: "spotify", label: "Динамическая", preview: "radial-gradient(circle at top left, #1db954, #191414)" },
  { value: "spotify-cover", label: "Живая обложка", preview: "linear-gradient(135deg, #1a8cff, #ff5e7e)" },
  { value: "night", label: "Ночь", preview: "linear-gradient(135deg, #111111, #000000)" },
  { value: "custom", label: "Кастомная", preview: "linear-gradient(135deg, #8a2387, #e94057, #f27121)" },
];

const styles: { value: StyleName; label: string; desc: string }[] = [
  { value: "default", label: "Стандартный", desc: "Базовый вид интерфейса" },
  { value: "matte", label: "Матовый", desc: "Мягкий фон с легким размытием" },
  { value: "flat", label: "Плоский", desc: "Сплошные цвета, минимализм" },
  { value: "noise", label: "Зерно", desc: "Эстетика пленки с текстурой шума" },
  { value: "glow", label: "Свечение", desc: "Неоновая подсветка цветом акцента" },
];

const accents: { value: AccentName | "custom"; label: string; preview: string }[] = [
  { value: "blue", label: "Синий", preview: "linear-gradient(135deg, #1a8cff, #6d3cff)" },
  { value: "magenta", label: "Розовый", preview: "linear-gradient(135deg, #c930ff, #ff5e7e)" },
  { value: "cyan", label: "Бирюзовый", preview: "linear-gradient(135deg, #16d1cf, #1e90ff)" },
  { value: "green", label: "Зелёный", preview: "linear-gradient(135deg, #2bc48a, #0090ff)" },
  { value: "orange", label: "Оранжевый", preview: "linear-gradient(135deg, #ff8c1a, #ff4f5e)" },
  { value: "red", label: "Красный", preview: "linear-gradient(135deg, #ff3b3b, #ff2f7a)" },
  { value: "gold", label: "Золото", preview: "linear-gradient(135deg, #ffc24a, #ff4f5e)" },
  { value: "mint", label: "Мятный", preview: "linear-gradient(135deg, #4dd4ac, #1e90ff)" },
  { value: "lavender", label: "Лаванда", preview: "linear-gradient(135deg, #b88dff, #5b3cff)" },
  { value: "electric", label: "Неон", preview: "linear-gradient(135deg, #c4ff3a, #1a8cff)" },
  { value: "coral", label: "Коралл", preview: "linear-gradient(135deg, #ff7766, #c930ff)" },
  { value: "sky", label: "Небо", preview: "linear-gradient(135deg, #5cd0ff, #6d3cff)" },
  { value: "crimson", label: "Бордо", preview: "linear-gradient(135deg, #ff2f7a, #5b1a8a)" },
  { value: "custom", label: "Свой", preview: "conic-gradient(from 180deg, #ff3b3b, #c930ff, #1a8cff, #2bc48a, #ffc24a, #ff3b3b)" },
];

const cacheUsage = ref<number>(estimateCache());
function estimateCache(): number {
  let bytes = 0;
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    bytes += key.length + (localStorage.getItem(key)?.length ?? 0);
  }
  return Math.round((bytes / (1024 * 1024)) * 100) / 100;
}

async function logout() {
  player.clear();
  library.reset();
  await auth.logout();
  router.replace({ name: "auth" });
}

async function changeDownloadPath() {
  if (window.vkmp?.selectFolder) {
    const folder = await window.vkmp.selectFolder();
    if (folder) {
      settings.downloadPath = folder;
      if (!settings.localFolders.includes(folder)) {
        settings.localFolders.push(folder);
      }
    }
  }
}

function resetDownloadPath() {
  settings.downloadPath = "";
}

function pickTheme(value: ThemeName) {
  theme.value = value;
}
function pickAccent(value: AccentName | "custom") {
  if (value === "custom") {
    customAccent.value = true;
  } else {
    customAccent.value = false;
    accent.value = value;
  }
}

const shakeMinimized = ref(false);
const flashAutostart = ref(false);
let animTimeoutId: any = null;

async function onAutoStartChange(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  if (!enabled) {
    startMinimized.value = false;
  }
  await settings.setAutoStart(enabled, startMinimized.value);
}

async function handleStartMinimizedClick(event: Event) {
  if (!autoStart.value) {
    event.preventDefault();
    
    if (animTimeoutId) {
      clearTimeout(animTimeoutId);
    }
    
    shakeMinimized.value = false;
    flashAutostart.value = false;
    
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 20));
    
    shakeMinimized.value = true;
    flashAutostart.value = true;
    
    animTimeoutId = setTimeout(() => {
      shakeMinimized.value = false;
      flashAutostart.value = false;
      animTimeoutId = null;
    }, 800);
    return;
  }
  
  const target = event.target as HTMLInputElement;
  const hidden = target.checked;
  startMinimized.value = hidden;
  await settings.setAutoStart(autoStart.value, hidden);
}

watch(startSidebarCollapsed, (val) => {
  ui.sidebarCollapsed = val;
});

const showEqModal = ref(false);

const electronAvailable = computed(() => Boolean(window.vkmp));

const appVersion = ref("");

onMounted(async () => {
  if (window.vkmp) {
    try {
      appVersion.value = await window.vkmp.getVersion();
    } catch {
      // ignore
    }
  }
});

const isCheckingUpdate = ref(false);
async function checkForUpdates() {
  if (!window.vkmp?.updater) return;
  isCheckingUpdate.value = true;
  try {
    const res = await window.vkmp.updater.checkForUpdates();
    if (res && !res.hasUpdate) {
      ui.notify("Установлена последняя версия", "success");
    }
    // If hasUpdate is true, UpdateNotification will show the download prompt.
  } catch (err) {
    ui.notify("Ошибка при проверке обновлений", "error");
    console.error(err);
  } finally {
    isCheckingUpdate.value = false;
  }
}

const isEditingBg = ref(false);
const inputUrl = ref(customBgUrl.value);

watch(customBgUrl, (newVal) => {
  inputUrl.value = newVal;
}, { immediate: true });

watch(activeTab, () => {
  isEditingBg.value = false;
});

async function onCustomBgFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  
  if (file.size > 8 * 1024 * 1024) {
    ui.notify("Файл слишком большой. Выберите изображение менее 8 МБ.", "error");
    return;
  }

  try {
    await settings.setCustomBgFile(file);
    ui.notify("Фон успешно загружен!", "success");
    isEditingBg.value = false;
  } catch (err) {
    ui.notify("Не удалось сохранить изображение", "error");
    console.error(err);
  }
}

async function applyCustomBgUrl() {
  const url = inputUrl.value.trim();
  if (!url) return;
  try {
    ui.notify("Загрузка фонового изображения...", "info");
    await settings.setCustomBgUrl(url);
    ui.notify("Фон успешно загружен!", "success");
    isEditingBg.value = false;
  } catch (err) {
    ui.notify("Не удалось загрузить изображение по ссылке. Проверьте правильность URL.", "error");
    console.error(err);
  }
}

async function removeCustomBg() {
  await settings.clearCustomBg();
  ui.notify("Кастомный фон удален", "success");
  isEditingBg.value = false;
}


function onBeforeEnter(el: Element) {
  const htmlEl = el as HTMLElement;
  htmlEl.style.height = "0";
  htmlEl.style.opacity = "0";
  htmlEl.style.marginBottom = "-16px";
  htmlEl.style.overflow = "hidden";
  htmlEl.style.paddingTop = "0";
  htmlEl.style.paddingBottom = "0";
  htmlEl.style.borderTopWidth = "0";
  htmlEl.style.borderBottomWidth = "0";
}

function onEnter(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement;
  
  // 1. Measure natural height before collapsing
  htmlEl.style.height = "";
  htmlEl.style.paddingTop = "";
  htmlEl.style.paddingBottom = "";
  htmlEl.style.borderTopWidth = "";
  htmlEl.style.borderBottomWidth = "";
  
  const naturalHeight = htmlEl.scrollHeight;
  
  // 2. Set starting collapsed styles
  htmlEl.style.height = "0";
  htmlEl.style.paddingTop = "0";
  htmlEl.style.paddingBottom = "0";
  htmlEl.style.borderTopWidth = "0";
  htmlEl.style.borderBottomWidth = "0";
  
  // Force layout reflow
  void htmlEl.offsetHeight;
  
  // 3. Set transition styles
  htmlEl.style.transition = "height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease, margin-bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1), padding 0.35s cubic-bezier(0.4, 0, 0.2, 1), border-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)";
  
  // 4. Set target styles (explicit values to avoid browser snapping bugs)
  htmlEl.style.height = `${naturalHeight}px`;
  htmlEl.style.opacity = "1";
  htmlEl.style.marginBottom = "0";
  htmlEl.style.paddingTop = "22px";
  htmlEl.style.paddingBottom = "18px";
  htmlEl.style.borderTopWidth = "1px";
  htmlEl.style.borderBottomWidth = "1px";
  
  setTimeout(done, 380);
}

function onAfterEnter(el: Element) {
  const htmlEl = el as HTMLElement;
  htmlEl.style.height = "";
  htmlEl.style.opacity = "";
  htmlEl.style.marginBottom = "";
  htmlEl.style.overflow = "";
  htmlEl.style.paddingTop = "";
  htmlEl.style.paddingBottom = "";
  htmlEl.style.borderTopWidth = "";
  htmlEl.style.borderBottomWidth = "";
  htmlEl.style.transition = "";
}

function onLeave(el: Element, done: () => void) {
  const htmlEl = el as HTMLElement;
  
  // Measure current height
  const currentHeight = htmlEl.scrollHeight;
  
  htmlEl.style.height = `${currentHeight}px`;
  htmlEl.style.opacity = "1";
  htmlEl.style.marginBottom = "0";
  htmlEl.style.overflow = "hidden";
  htmlEl.style.paddingTop = "22px";
  htmlEl.style.paddingBottom = "18px";
  htmlEl.style.borderTopWidth = "1px";
  htmlEl.style.borderBottomWidth = "1px";
  
  // Force layout reflow
  void htmlEl.offsetHeight;
  
  // Set transition styles
  htmlEl.style.transition = "height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.35s ease, margin-bottom 0.35s cubic-bezier(0.4, 0, 0.2, 1), padding 0.35s cubic-bezier(0.4, 0, 0.2, 1), border-width 0.35s cubic-bezier(0.4, 0, 0.2, 1)";
  
  // Target collapsed styles
  htmlEl.style.height = "0";
  htmlEl.style.opacity = "0";
  htmlEl.style.marginBottom = "-16px";
  htmlEl.style.paddingTop = "0";
  htmlEl.style.paddingBottom = "0";
  htmlEl.style.borderTopWidth = "0";
  htmlEl.style.borderBottomWidth = "0";
  
  setTimeout(done, 380);
}

function onAfterLeave(el: Element) {
  const htmlEl = el as HTMLElement;
  htmlEl.style.height = "";
  htmlEl.style.opacity = "";
  htmlEl.style.marginBottom = "";
  htmlEl.style.overflow = "";
  htmlEl.style.paddingTop = "";
  htmlEl.style.paddingBottom = "";
  htmlEl.style.borderTopWidth = "";
  htmlEl.style.borderBottomWidth = "";
  htmlEl.style.transition = "";
}
</script>

<template>
  <ScrollArea>
    <PageHeader title="Настройки" />

    <div class="settings__tabs">
      <button 
        v-for="tab in tabs" 
        :key="tab.id"
        class="settings__tab" 
        :class="{ 'settings__tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <section class="settings">
      <Transition name="fade-slide" mode="out-in">
        <div :key="activeTab" class="settings__tab-pane">
          <!-- Внешний вид -->
          <template v-if="activeTab === 'appearance'">
        <article class="settings__card">
          <h2>Тема</h2>
          <div class="settings__grid settings__grid--themes">
            <button
              v-for="t in themes"
              :key="t.value"
              class="settings__tile"
              :class="{ 'settings__tile--active': theme === t.value }"
              @click="pickTheme(t.value)"
            >
              <span class="settings__tile-preview" :style="{ background: t.preview }" />
              <span class="settings__tile-label">{{ t.label }}</span>
            </button>
          </div>
        </article>

        <!-- Настройки кастомного фона (слайд-ин анимка при выборе темы custom) -->
        <Transition
          :css="false"
          @before-enter="onBeforeEnter"
          @enter="onEnter"
          @after-enter="onAfterEnter"
          @leave="onLeave"
          @after-leave="onAfterLeave"
        >
          <article v-if="theme === 'custom'" key="custom-settings" class="settings__card" style="display: flex; flex-direction: column; gap: 16px;">
              <div style="display: flex; align-items: baseline; justify-content: space-between;">
                <h2>Настройки кастомного фона</h2>
                <button 
                  class="settings__reset-btn" 
                  @click="customBgBlur = 0; customBgZoom = 1.0; customBgBrightness = 100; customBgPosX = 50; customBgPosY = 50;"
                  title="Сбросить настройки кастомного фона"
                >
                  Сбросить
                </button>
              </div>
              
              <!-- Отображение текущего фона, если он установлен -->
              <div v-if="customBgCachedUrl" class="settings__row settings__row--bg-preview" style="display: flex; gap: 16px; align-items: center; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.08); padding: 12px; border-radius: 8px;">
                <img :src="customBgCachedUrl" style="width: 60px; height: 60px; border-radius: 6px; object-fit: cover; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);" />
                <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                  <div class="settings__row-title" style="font-weight: 600; font-size: 0.95rem;">Кастомный фон установлен</div>
                  <div class="settings__row-sub" style="word-break: break-all; font-size: 0.8rem; opacity: 0.7; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    {{ customBgUrl ? customBgUrl : 'Локальный файл с ПК' }}
                  </div>
                </div>
                <div style="display: flex; gap: 8px; flex-direction: column; align-items: stretch; width: 110px;">
                  <button type="button" class="btn btn--ghost" @click="isEditingBg = !isEditingBg" style="padding: 4px 8px; font-size: 0.8rem; text-align: center;">
                    {{ isEditingBg ? 'Скрыть' : 'Изменить' }}
                  </button>
                  <button type="button" class="btn btn--ghost" @click="removeCustomBg" style="padding: 4px 8px; font-size: 0.8rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.2); background: rgba(239, 68, 68, 0.05); text-align: center;">
                    Удалить
                  </button>
                </div>
              </div>

              <!-- Блок загрузки/редактирования изображения -->
              <div v-if="!customBgCachedUrl || isEditingBg" class="settings__bg-editor-panel" style="display: flex; flex-direction: column; gap: 12px; border: 1px solid rgba(255, 255, 255, 0.08); padding: 14px; border-radius: 8px; background: rgba(255, 255, 255, 0.02);">
                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <div class="settings__row-title" style="font-size: 0.9rem;">Ссылка на изображение</div>
                  <div style="display: flex; gap: 8px;">
                    <input v-model="inputUrl" type="text" class="settings__text-input" placeholder="https://example.com/image.jpg" style="flex: 1; height: 36px; padding: 0 10px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff;" @keydown.enter="applyCustomBgUrl" />
                    <button type="button" class="btn btn--primary" @click="applyCustomBgUrl" style="height: 36px; padding: 0 16px; font-size: 0.85rem; border-radius: 6px;">
                      ОК
                    </button>
                  </div>
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px;">
                  <div class="settings__row-title" style="font-size: 0.9rem;">Выбрать локальный файл</div>
                  <input type="file" accept="image/*" @change="onCustomBgFileChange" class="settings__file-input" style="width: 100%; color: var(--text-2); font-size: 0.85rem;" />
                </div>
              </div>

              <!-- Ползунки настроек (только если фон установлен) -->
              <template v-if="customBgCachedUrl">
                <label class="settings__row">
                  <div>
                    <div class="settings__row-title">Размытие (Blur)</div>
                    <div class="settings__row-sub">Степень размытия фонового изображения</div>
                  </div>
                  <div class="settings__range">
                    <input v-model.number="customBgBlur" type="range" min="0" max="120" step="1" />
                    <span>{{ customBgBlur }} px</span>
                  </div>
                </label>

                <label class="settings__row">
                  <div>
                    <div class="settings__row-title">Масштаб (Zoom)</div>
                    <div class="settings__row-sub">Приближение фонового изображения</div>
                  </div>
                  <div class="settings__range">
                    <input v-model.number="customBgZoom" type="range" min="1" max="2.5" step="0.05" />
                    <span>{{ Math.round(customBgZoom * 100) }}%</span>
                  </div>
                </label>

                <label class="settings__row">
                  <div>
                    <div class="settings__row-title">Яркость (Brightness)</div>
                    <div class="settings__row-sub">Регулировка яркости фонового изображения</div>
                  </div>
                  <div class="settings__range">
                    <input v-model.number="customBgBrightness" type="range" min="20" max="100" step="1" />
                    <span>{{ customBgBrightness }}%</span>
                  </div>
                </label>

                <label class="settings__row">
                  <div>
                    <div class="settings__row-title">Положение по X</div>
                    <div class="settings__row-sub">Горизонтальное смещение центра изображения</div>
                  </div>
                  <div class="settings__range">
                    <input v-model.number="customBgPosX" type="range" min="0" max="100" step="1" />
                    <span>{{ customBgPosX }}%</span>
                  </div>
                </label>

                <label class="settings__row">
                  <div>
                    <div class="settings__row-title">Положение по Y</div>
                    <div class="settings__row-sub">Вертикальное смещение центра изображения</div>
                  </div>
                  <div class="settings__range">
                    <input v-model.number="customBgPosY" type="range" min="0" max="100" step="1" />
                    <span>{{ customBgPosY }}%</span>
                  </div>
                </label>
              </template>
            </article>
          </Transition>

        <!-- Настройки живой обложки (слайд-ин анимка при выборе темы spotify-cover) -->
        <Transition
          :css="false"
          @before-enter="onBeforeEnter"
          @enter="onEnter"
          @after-enter="onAfterEnter"
          @leave="onLeave"
          @after-leave="onAfterLeave"
        >
          <article v-if="theme === 'spotify-cover'" key="cover-settings" class="settings__card" style="display: flex; flex-direction: column; gap: 16px;">
              <div style="display: flex; align-items: baseline; justify-content: space-between;">
                <h2>Настройки живой обложки</h2>
                <button 
                  class="settings__reset-btn" 
                  @click="coverBgBlur = 90"
                  title="Сбросить настройки живой обложки"
                >
                  Сбросить
                </button>
              </div>
              
              <label class="settings__row">
                <div>
                  <div class="settings__row-title">Размытие (Blur)</div>
                  <div class="settings__row-sub">Степень размытия фона обложки</div>
                </div>
                <div class="settings__range">
                  <input v-model.number="coverBgBlur" type="range" min="0" max="120" step="1" />
                  <span>{{ coverBgBlur }} px</span>
                </div>
              </label>
          </article>
        </Transition>

        <article class="settings__card">
          <h2>Стиль (Материалы)</h2>
          <div class="settings__grid settings__grid--styles">
            <button
              v-for="s in styles"
              :key="s.value"
              class="settings__style-btn"
              :class="{ 'settings__style-btn--active': style === s.value }"
              @click="style = s.value"
            >
              <div class="settings__style-title">{{ s.label }}</div>
              <div class="settings__style-desc">{{ s.desc }}</div>
            </button>
          </div>
        </article>

        <article class="settings__card">
          <h2>Акцент</h2>
          <div class="settings__grid settings__grid--accents">
            <button
              v-for="a in accents"
              :key="a.value"
              class="settings__accent"
              :class="{ 'settings__accent--active': (a.value === 'custom' ? customAccent : !customAccent && accent === a.value) }"
              :style="{ background: a.preview }"
              :title="a.label"
              @click="pickAccent(a.value)"
            />
          </div>

          <div v-if="customAccent" class="settings__custom-accent-pane">
            <h3 class="settings__sub-title">Настройка своего акцента</h3>
            
            <div class="settings__custom-row">
              <label class="settings__radio">
                <input type="radio" v-model="customAccentType" value="gradient" />
                <span>Градиент</span>
              </label>
              <label class="settings__radio">
                <input type="radio" v-model="customAccentType" value="solid" />
                <span>Сплошной цвет</span>
              </label>
            </div>

            <div class="settings__custom-row settings__custom-colors">
              <label class="settings__color-picker">
                <span>{{ customAccentType === 'gradient' ? 'Цвет 1' : 'Цвет' }}</span>
                <input type="color" v-model="customAccentColor1" />
              </label>
              <label v-if="customAccentType === 'gradient'" class="settings__color-picker">
                <span>Цвет 2</span>
                <input type="color" v-model="customAccentColor2" />
              </label>
            </div>
          </div>
        </article>

        <article class="settings__card">
          <div style="display: flex; align-items: baseline; justify-content: space-between;">
            <h2>Шрифт</h2>
            <button 
              class="settings__reset-btn" 
              @click="fontFamily = 'Nunito'; fontSizeScale = 1.0; letterSpacing = 0;"
              title="Сбросить настройки шрифта"
            >
              Сбросить
            </button>
          </div>
          <div class="settings__grid settings__grid--fonts">
            <button
              v-for="f in FONT_OPTIONS"
              :key="f"
              class="settings__font"
              :class="{ 'settings__font--active': fontFamily === f }"
              :style="{ fontFamily: `'${f}', sans-serif` }"
              @click="fontFamily = f"
            >
              <span class="settings__font-name">{{ f }}</span>
              <span class="settings__font-sample">Aa</span>
            </button>
          </div>
          <label class="settings__row" style="margin-top: 16px;">
            <div>
              <div class="settings__row-title">Масштаб текста</div>
              <div class="settings__row-sub">Увеличение или уменьшение шрифта везде</div>
            </div>
            <div class="settings__range">
              <input v-model.number="fontSizeScale" type="range" min="0.8" max="1.5" step="0.05" />
              <span>{{ Math.round(fontSizeScale * 100) }}%</span>
            </div>
          </label>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Межбуквенный интервал</div>
              <div class="settings__row-sub">Расстояние между символами в тексте</div>
            </div>
            <div class="settings__range">
              <input v-model.number="letterSpacing" type="range" min="-1" max="2" step="0.1" />
              <span>{{ letterSpacing > 0 ? '+' : '' }}{{ letterSpacing }}px</span>
            </div>
          </label>
        </article>

        <article class="settings__card">
          <h2>Анимации</h2>
          <div class="settings__row" style="align-items: flex-start;">
            <div>
              <div class="settings__row-title">Анимация перехода между страницами</div>
              <div class="settings__row-sub">Эффект при переходе по вкладкам приложения</div>
            </div>
            <div class="settings__segmented">
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': routerAnimation === 'fade' }"
                @click="routerAnimation = 'fade'"
              >
                Fade
              </button>
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': routerAnimation === 'slide' }"
                @click="routerAnimation = 'slide'"
              >
                Slide
              </button>
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': routerAnimation === 'zoom' }"
                @click="routerAnimation = 'zoom'"
              >
                Zoom
              </button>
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': routerAnimation === 'none' }"
                @click="routerAnimation = 'none'"
              >
                Выкл
              </button>
            </div>
          </div>
        </article>

        <article class="settings__card">
          <h2>Списки и очередь</h2>
          <div class="settings__row" style="align-items: flex-start;">
            <div>
              <div class="settings__row-title">Стиль иконки перетаскивания</div>
              <div class="settings__row-sub">Иконка, за которую можно тянуть треки в очереди</div>
            </div>
            <div class="settings__segmented">
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': dragHandleStyle === 'dots' }"
                @click="dragHandleStyle = 'dots'"
              >
                Точечки
              </button>
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': dragHandleStyle === 'lines' }"
                @click="dragHandleStyle = 'lines'"
              >
                Полосочки
              </button>
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': dragHandleStyle === 'grip' }"
                @click="dragHandleStyle = 'grip'"
              >
                Хват
              </button>
            </div>
          </div>
        </article>

        <article class="settings__card">
          <h2>Значки и иконки</h2>
          <div class="settings__row" style="align-items: flex-start;">
            <div>
              <div class="settings__row-title">Стиль значков</div>
              <div class="settings__row-sub">Стиль оформления всех иконок в плеере и меню</div>
            </div>
            <div class="settings__segmented">
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': iconSet === 'line' }"
                @click="iconSet = 'line'"
              >
                Контурные
              </button>
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': iconSet === 'flat' }"
                @click="iconSet = 'flat'"
              >
                Залитые
              </button>
              <button 
                class="settings__segmented-btn" 
                :class="{ 'settings__segmented-btn--active': iconSet === 'rounded' }"
                @click="iconSet = 'rounded'"
              >
                Скругленные
              </button>
            </div>
          </div>
        </article>

        <article class="settings__card">
          <div style="display: flex; align-items: baseline; justify-content: space-between;">
            <h2>Яркость на Главной</h2>
            <button 
              class="settings__reset-btn" 
              @click="homeCardsBrightness = 100; homeCardsBrightnessAuto = false; homeCardsBrightnessDimmed = 50; homeCardsBrightnessTimeStart = '22:00'; homeCardsBrightnessTimeEnd = '06:00';"
              title="Сбросить настройки яркости карточек"
            >
              Сбросить
            </button>
          </div>
          
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Постоянная яркость</div>
              <div class="settings__row-sub">Степень яркости обложек на Главной</div>
            </div>
            <div class="settings__range">
              <input v-model.number="homeCardsBrightness" type="range" min="10" max="100" step="1" />
              <span>{{ homeCardsBrightness }}%</span>
            </div>
          </label>

          <label class="settings__row">
            <div>
              <div class="settings__row-title">Яркость по таймеру</div>
              <div class="settings__row-sub">Приглушать яркость обложек в установленное время</div>
            </div>
            <input v-model="homeCardsBrightnessAuto" type="checkbox" class="settings__switch" />
          </label>

          <Transition
            :css="false"
            @before-enter="onBeforeEnter"
            @enter="onEnter"
            @after-enter="onAfterEnter"
            @leave="onLeave"
            @after-leave="onAfterLeave"
          >
            <div v-if="homeCardsBrightnessAuto" style="display: flex; flex-direction: column; gap: 16px;">
              <label class="settings__row" style="border-top: none; padding-top: 12px;">
                <div>
                  <div class="settings__row-title">Яркость ночью</div>
                  <div class="settings__row-sub">Степень приглушения обложек</div>
                </div>
                <div class="settings__range">
                  <input v-model.number="homeCardsBrightnessDimmed" type="range" min="10" max="100" step="1" />
                  <span>{{ homeCardsBrightnessDimmed }}%</span>
                </div>
              </label>

              <div class="settings__row">
                <div>
                  <div class="settings__row-title">Интервал времени</div>
                  <div class="settings__row-sub">Когда применять ночную яркость</div>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input v-model="homeCardsBrightnessTimeStart" type="time" class="settings__text-input" style="width: 100px; text-align: center;" />
                  <span style="color: var(--text-2); font-size: 14px;">&mdash;</span>
                  <input v-model="homeCardsBrightnessTimeEnd" type="time" class="settings__text-input" style="width: 100px; text-align: center;" />
                </div>
              </div>
            </div>
          </Transition>
        </article>

        <article class="settings__card">
          <h2>Боковое меню (Сайдбар)</h2>
          <div class="settings__row">
            <div>
              <div class="settings__row-title">Настройка вкладок</div>
              <div class="settings__row-sub">Изменить порядок или видимость вкладок бокового меню</div>
            </div>
            <button class="btn btn--ghost" @click="ui.sidebarSettingsOpen = true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Редактировать
            </button>
          </div>
        </article>

        <article class="settings__card">
          <h2>Кнопки действий треков</h2>
          <div class="settings__row">
            <div>
              <div class="settings__row-title">Настройка кнопок действий</div>
              <div class="settings__row-sub">Изменить порядок или видимость быстрых кнопок в строках треков</div>
            </div>
            <button class="btn btn--ghost" @click="ui.trackSettingsOpen = true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Редактировать
            </button>
          </div>
        </article>
      </template>

      <!-- Воспроизведение -->
      <template v-if="activeTab === 'playback'">
        <article class="settings__card">
          <h2>Воспроизведение</h2>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Громкость при старте</div>
              <div class="settings__row-sub">С какой громкости запускать плеер при каждом включении</div>
            </div>
            <div class="settings__range">
              <input v-model.number="startupVolumePct" type="range" min="0" max="100" step="1" />
              <span>{{ startupVolumePct }}%</span>
            </div>
          </label>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Плавный переход (Crossfade)</div>
              <div class="settings__row-sub">Уменьшать громкость старого трека и плавно включать новый</div>
            </div>
            <input v-model="crossfade" type="checkbox" class="settings__switch" />
          </label>
          <label class="settings__row" v-if="crossfade">
            <div>
              <div class="settings__row-title">Длительность перехода</div>
              <div class="settings__row-sub">В секундах</div>
            </div>
            <div class="settings__range">
              <input v-model.number="crossfadeDuration" type="range" min="1" max="5" step="1" />
              <span>{{ crossfadeDuration }} с</span>
            </div>
          </label>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Автоскролл в очереди</div>
              <div class="settings__row-sub">Скроллить список к текущему треку при смене песни</div>
            </div>
            <input v-model="autoScrollQueue" type="checkbox" class="settings__switch" />
          </label>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Предзагрузка треков без прерываний</div>
              <div class="settings__row-sub">Заранее подгружать следующую песню в фоне для мгновенного перехода</div>
            </div>
            <input v-model="prefetchEnabled" type="checkbox" class="settings__switch" />
          </label>
        </article>

        <article class="settings__card">
          <h2>Пауза и переключения</h2>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Плавное затухание (Fade)</div>
              <div class="settings__row-sub">Плавно изменять громкость при паузе и старте</div>
            </div>
            <input v-model="fadeEnabled" type="checkbox" class="settings__switch" />
          </label>
          <label class="settings__row" v-if="fadeEnabled">
            <div>
              <div class="settings__row-title">Длительность затухания</div>
              <div class="settings__row-sub">В миллисекундах</div>
            </div>
            <div class="settings__range">
              <input v-model.number="fadeDurationMs" type="range" min="100" max="1500" step="50" />
              <span>{{ fadeDurationMs }} мс</span>
            </div>
          </label>
        </article>

        <article class="settings__card">
          <h2>Эквалайзер</h2>
          <div class="settings__row">
            <div>
              <div class="settings__row-title">Настроить звук</div>
              <div class="settings__row-sub">Усиление басов, пресеты или ручная настройка частот</div>
            </div>
            <button class="btn btn--primary" style="padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; background: var(--bg-3); color: var(--text-0);" @click="showEqModal = true">Открыть эквалайзер</button>
          </div>
        </article>
      </template>

      <!-- Приложение -->
      <template v-if="activeTab === 'app'">
        <article class="settings__card">
          <h2>Скачивание</h2>
          <div class="settings__row">
            <div>
              <div class="settings__row-title">Папка для скачивания музыки</div>
              <div class="settings__row-sub" style="font-family: monospace;">
                {{ settings.downloadPath || 'По умолчанию: папка приложения (.vk-music-player/downloads)' }}
              </div>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn btn--secondary btn--sm" style="padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border);" @click="changeDownloadPath">
                Изменить...
              </button>
              <button v-if="settings.downloadPath" class="btn btn--ghost btn--sm" style="padding: 4px 12px; border-radius: 6px;" @click="resetDownloadPath">
                Сбросить
              </button>
            </div>
          </div>
        </article>

        <article class="settings__card">
          <h2>Анимации и производительность</h2>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Режим производительности</div>
              <div class="settings__row-sub">Убирает spring-анимации, ускоряет UI на слабых ПК</div>
            </div>
            <input v-model="performanceMode" type="checkbox" class="settings__switch" />
          </label>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Уменьшить движение</div>
              <div class="settings__row-sub">Уважает системный prefers-reduced-motion и отключает декоративные эффекты</div>
            </div>
            <input v-model="reduceMotion" type="checkbox" class="settings__switch" />
          </label>
        </article>

        <article class="settings__card">
          <h2>Поведение</h2>
          <label
            class="settings__row"
            :class="{
              'settings__row--disabled': !electronAvailable,
              'settings__row--flash': flashAutostart
            }"
          >
            <div>
              <div class="settings__row-title">Автозапуск при старте системы</div>
              <div class="settings__row-sub">{{ electronAvailable ? "Запускать VK Music вместе с ОС" : "Доступно только в десктоп-версии" }}</div>
            </div>
            <input
              :checked="autoStart"
              type="checkbox"
              class="settings__switch"
              :disabled="!electronAvailable"
              @change="onAutoStartChange"
            />
          </label>
          <label class="settings__row" :class="{ 'settings__row--disabled': !electronAvailable }">
            <div>
              <div class="settings__row-title">Закрытие в трей</div>
              <div class="settings__row-sub">Кнопка × сворачивает в трей, а не закрывает приложение</div>
            </div>
            <input v-model="closeToTray" type="checkbox" class="settings__switch" :disabled="!electronAvailable" />
          </label>
          <label
            class="settings__row"
            :class="{
              'settings__row--disabled': !electronAvailable,
              'settings__row--shake': shakeMinimized
            }"
          >
            <div>
              <div class="settings__row-title">Запуск свернутым</div>
              <div class="settings__row-sub">Подходит для автозапуска — не отвлекает</div>
            </div>
            <input
              :checked="startMinimized"
              type="checkbox"
              class="settings__switch"
              :class="{ 'settings__switch--error': shakeMinimized }"
              :disabled="!electronAvailable"
              @click="handleStartMinimizedClick"
            />
          </label>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Запускать со свернутым меню</div>
              <div class="settings__row-sub">Боковая панель будет свернута при каждом запуске приложения</div>
            </div>
            <input v-model="startSidebarCollapsed" type="checkbox" class="settings__switch" />
          </label>
          <label class="settings__row" :class="{ 'settings__row--disabled': !electronAvailable }">
            <div>
              <div class="settings__row-title">Аппаратное ускорение</div>
              <div class="settings__row-sub">Применится при следующем запуске</div>
            </div>
            <input v-model="hardwareAcceleration" type="checkbox" class="settings__switch" :disabled="!electronAvailable" />
          </label>
        </article>

        <article class="settings__card" v-if="electronAvailable">
          <div style="display: flex; align-items: baseline; justify-content: space-between;">
            <h2>Обновления</h2>
            <span v-if="appVersion" style="color: var(--text-2); font-size: calc(13px * var(--font-scale, 1)); margin-right: 32px;">v{{ appVersion }}</span>
          </div>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Автоматическая проверка обновлений</div>
              <div class="settings__row-sub">Раз в час плеер будет тихо проверять новые версии</div>
            </div>
            <input v-model="autoUpdateCheck" type="checkbox" class="settings__switch" />
          </label>
          <div class="settings__row">
            <div>
              <div class="settings__row-title">Проверить обновления вручную</div>
              <div class="settings__row-sub">Нажмите, чтобы проверить прямо сейчас</div>
            </div>
            <button class="btn btn--primary" style="padding: 8px 16px; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; background: var(--bg-3); color: var(--text-0);" @click="checkForUpdates" :disabled="isCheckingUpdate">
              {{ isCheckingUpdate ? 'Проверка...' : 'Проверить' }}
            </button>
          </div>
        </article>

        <article class="settings__card">
          <h2>Кеш и Сеть</h2>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Искать обложки в других сервисах</div>
              <div class="settings__row-sub">Подгружаем обложки из iTunes, если их нет в ВК</div>
            </div>
            <input v-model="externalCovers" type="checkbox" class="settings__switch" />
          </label>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Лимит локального кеша</div>
              <div class="settings__row-sub">Цели хранения: индекс библиотеки, рекомендации, последние треки (сейчас используется ≈ {{ cacheUsage }} MB)</div>
            </div>
            <div class="settings__range">
              <input v-model.number="cacheSize" type="range" min="50" max="2000" step="50" />
              <span>{{ cacheSize }} MB</span>
            </div>
          </label>
        </article>

        <article class="settings__card">
          <h2>Интеграции</h2>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Discord RPC</div>
              <div class="settings__row-sub">Отображать статус в Discord</div>
            </div>
            <input v-model="discordRpc" type="checkbox" class="settings__switch" />
          </label>
          <label class="settings__row" v-if="discordRpc">
            <div>
              <div class="settings__row-title">Показывать текущий трек</div>
              <div class="settings__row-sub">Вместе с кастомным текстом отображать название и артиста</div>
            </div>
            <input v-model="discordRpcShowTrack" type="checkbox" class="settings__switch" />
          </label>
          <label class="settings__row" v-if="discordRpc">
            <div>
              <div class="settings__row-title">Текст статуса Discord</div>
              <div class="settings__row-sub">Будет отображаться в первой строке</div>
            </div>
            <div class="settings__input-wrap">
              <input 
                v-model="discordRpcText" 
                type="text" 
                class="settings__text-input" 
                placeholder="Слушает музыку"
              />
            </div>
          </label>
        </article>
      </template>

      <!-- Аккаунт -->
      <template v-if="activeTab === 'account'">
        <article class="settings__card settings__card--danger">
          <h2>Аккаунт</h2>
          <div class="settings__row">
            <div>
              <div class="settings__row-title">{{ auth.displayName }}</div>
              <div class="settings__row-sub">
                {{ auth.status?.authenticated ? `id ${auth.status.user_id}` : "Не авторизован" }}
              </div>
            </div>
            <button class="btn btn--ghost" @click="logout">Выйти</button>
          </div>
        </article>

        <article class="settings__card">
          <h2>О приложении</h2>
          <p class="settings__hint">
            VK Music Player — десктоп-плеер на Vue 3 + Electron с FastAPI бэкендом, который проксирует
            VK API. Авторизация — через официальный OAuth ВК, токен хранится локально
            с правами 600.
          </p>
        </article>
          </template>
        </div>
      </Transition>
    </section>

    <EqualizerModal :show="showEqModal" @close="showEqModal = false" />
  </ScrollArea>
</template>

<style scoped>
.settings__tabs {
  margin: 0 32px 24px;
  display: flex;
  gap: 12px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 12px;
}
.settings__tab {
  padding: 8px 16px;
  background: transparent;
  border: none;
  font-size: calc(15px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--text-2);
  cursor: pointer;
  border-radius: 8px;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
}
.settings__tab:hover {
  background: var(--bg-2);
  color: var(--text-0);
}
.settings__tab--active {
  background: var(--bg-2);
  color: var(--accent-1);
}

.settings {
  padding: 0 32px 32px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  max-width: 800px;
}
.settings__tab-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
}

.settings__card {
  padding: 22px 22px 18px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--app-shadow, none);
}
.settings__card h2 {
  margin: 0;
  font-size: calc(15px * var(--font-scale, 1));
  font-weight: 700;
  letter-spacing: calc(-0.005em + var(--letter-spacing, 0px));
}
.settings__card--danger {
  border-color: rgba(255, 94, 126, 0.25);
}
.settings__grid {
  display: grid;
  gap: 12px;
}
.settings__grid--themes {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}
.settings__grid--styles {
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
}
.settings__grid--accents {
  grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
}
.settings__grid--fonts {
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
}
.settings__tile {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  padding: 6px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: border-color var(--motion-duration-fast) var(--motion-ease-out), transform var(--motion-duration-fast) var(--motion-ease-out);
}
.settings__tile:hover {
  transform: translateY(-1px);
}
.settings__tile--active {
  border-color: var(--accent-1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-1) 18%, transparent);
}
.settings__tile-preview {
  display: block;
  height: 64px;
  border-radius: 8px;
}
.settings__tile-label {
  font-size: calc(12px * var(--font-scale, 1));
  font-weight: 600;
  text-align: center;
  color: var(--text-1);
}
.settings__style-btn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: border-color var(--motion-duration-fast), transform var(--motion-duration-fast);
  text-align: left;
}
.settings__style-btn:hover {
  transform: translateY(-1px);
}
.settings__style-btn--active {
  border-color: var(--accent-1);
  background: color-mix(in srgb, var(--accent-1) 5%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-1) 18%, transparent);
}
.settings__style-title {
  font-size: calc(14px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--text-0);
}
.settings__style-desc {
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
}

.settings__accent {
  height: 48px;
  border-radius: 12px;
  border: 1px solid var(--border);
  transition: transform var(--motion-duration-fast) var(--motion-ease-out), box-shadow var(--motion-duration-fast) var(--motion-ease-out);
}
.settings__accent:hover {
  transform: scale(var(--motion-scale-hover));
}
.settings__accent--active {
  border-color: var(--text-0);
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.1);
}

.settings__custom-accent-pane {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-2);
  border-radius: 12px;
  border: 1px solid var(--border);
}
.settings__sub-title {
  margin: 0 0 12px 0;
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--text-1);
}
.settings__custom-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}
.settings__custom-row:last-child {
  margin-bottom: 0;
}
.settings__radio {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: calc(14px * var(--font-scale, 1));
  color: var(--text-0);
  cursor: pointer;
}
.settings__radio input {
  accent-color: var(--accent-1);
}
.settings__segmented {
  display: inline-flex;
  background: var(--bg-3);
  border-radius: 8px;
  padding: 4px;
  gap: 4px;
}
.settings__segmented-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 500;
  color: var(--text-2);
  cursor: pointer;
  background: transparent;
  border: none;
  transition: all var(--motion-duration-fast);
}
.settings__segmented-btn:hover {
  color: var(--text-0);
}
.settings__segmented-btn--active {
  background: var(--bg-1);
  color: var(--text-0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
.settings__color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: calc(14px * var(--font-scale, 1));
  color: var(--text-0);
}
.settings__color-picker input[type="color"] {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.settings__color-picker input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 0;
}
.settings__color-picker input[type="color"]::-webkit-color-swatch {
  border: 1px solid var(--border);
  border-radius: 8px;
}

.settings__font {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 6px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
}
.settings__font:hover {
  transform: translateY(-1px);
  background: var(--bg-3);
}
.settings__font--active {
  border-color: var(--accent-1);
  background: color-mix(in srgb, var(--accent-1) 5%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-1) 18%, transparent);
}
.settings__font-name {
  font-size: calc(11px * var(--font-scale, 1));
  color: var(--text-2);
}
.settings__font-sample {
  font-size: calc(24px * var(--font-scale, 1));
  color: var(--text-0);
}

.settings__row {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: space-between;
  padding: 8px 0;
  border-top: 1px solid var(--divider);
}
.settings__row:first-of-type {
  border-top: none;
  padding-top: 0;
}
.settings__row--actions {
  justify-content: flex-end;
}
.settings__row--disabled {
  opacity: 0.5;
}
.settings__row-title {
  font-weight: 600;
}
.settings__row-sub {
  color: var(--text-2);
  font-size: calc(12px * var(--font-scale, 1));
  max-width: 360px;
}

.settings__switch {
  -webkit-appearance: none;
  appearance: none;
  width: 44px;
  height: 24px;
  border-radius: 999px;
  background: var(--bg-3);
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--motion-duration-fast) var(--motion-ease-out),
              box-shadow var(--motion-duration-fast) var(--motion-ease-out);
  overflow: hidden;
}
.settings__switch::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  opacity: 0;
  transition: opacity 0.3s ease;
}
.settings__switch:checked::before {
  opacity: 1;
}
.settings__switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1;
}
.settings__switch:checked::after {
  transform: translateX(20px);
}
.settings__range {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.settings__range input[type="range"] {
  width: 160px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-strong);
  height: 6px;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
  transition: background var(--motion-duration-fast);
}
.settings__range input[type="range"]:hover {
  background: var(--text-3);
}
.settings__range input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text-0);
  border: 3px solid var(--accent-1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  transition: transform var(--motion-duration-fast), box-shadow var(--motion-duration-fast);
}
.settings__range input[type="range"]::-webkit-slider-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
}
.settings__range input[type="range"]::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--text-0);
  border: 3px solid var(--accent-1);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  transition: transform var(--motion-duration-fast), box-shadow var(--motion-duration-fast);
}
.settings__range input[type="range"]::-moz-range-thumb:hover {
  transform: scale(1.15);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
}
.settings__range input[type="range"]::-moz-range-track {
  background: transparent;
  height: 6px;
  border-radius: 3px;
}
.settings__range span {
  min-width: 70px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  font-size: calc(12px * var(--font-scale, 1));
}
.settings__text-input {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-0);
  padding: 8px 12px;
  font-family: inherit;
  font-size: calc(13px * var(--font-scale, 1));
  width: 200px;
  outline: none;
  transition: border-color var(--motion-duration-fast);
}
.settings__text-input:focus {
  border-color: var(--accent-1);
}
.settings__hint {
  margin: 0;
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
  line-height: 1.6;
}
.settings__hint code {
  background: var(--bg-2);
  padding: 0 4px;
  border-radius: 4px;
}

.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: opacity 0.25s var(--motion-ease-out), transform 0.25s var(--motion-ease-out);
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}




@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-3px); }
  40%, 80% { transform: translateX(3px); }
}

.settings__row--shake {
  animation: shake 0.4s ease-in-out;
}

.settings__switch--error {
  background: var(--danger, #ff5e7e) !important;
  box-shadow: 0 0 0 4px rgba(255, 94, 126, 0.2);
}

@keyframes flash-switch {
  0%, 100% {
    box-shadow: none;
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent-1) 30%, transparent);
    transform: scale(1.06);
  }
}

@keyframes flash-text {
  0%, 100% {
    color: var(--text-0);
  }
  50% {
    color: var(--accent-1);
  }
}

.settings__row--flash .settings__switch {
  animation: flash-switch 0.8s ease-in-out;
}

.settings__row--flash .settings__row-title {
  animation: flash-text 0.8s ease-in-out;
}
.settings__reset-btn {
  background: none;
  border: none;
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all var(--motion-duration-fast);
}
.settings__reset-btn:hover {
  color: var(--text-0);
  background: var(--bg-2);
}
.settings__file-input {
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-2);
  cursor: pointer;
}
.settings__file-input::-webkit-file-upload-button {
  background: var(--bg-3);
  color: var(--text-0);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 8px 16px;
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 600;
  cursor: pointer;
  margin-right: 12px;
  transition: background var(--motion-duration-base) var(--motion-ease-out), transform var(--motion-duration-base) var(--motion-ease-out);
}
.settings__file-input::-webkit-file-upload-button:hover {
  background: var(--bg-2);
  transform: scale(1.02);
}
</style>
