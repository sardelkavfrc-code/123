<script setup lang="ts">
import { computed, ref } from "vue";
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
  crossfade,
  crossfadeDuration,
  autoScrollQueue,
  discordRpc,
  discordRpcText,
  discordRpcShowTrack,
} = storeToRefs(settings);

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
  { value: "mocha", label: "Кофе", preview: "linear-gradient(135deg, #342a24, #161210)" },
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

async function clearCache() {
  localStorage.clear();
  library.reset();
  cacheUsage.value = estimateCache();
  ui.notify("Кеш очищен", "success");
}

async function logout() {
  player.clear();
  library.reset();
  await auth.logout();
  router.replace({ name: "auth" });
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

async function onAutoStartChange(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  await settings.setAutoStart(enabled, startMinimized.value);
}

async function onStartMinimizedChange(event: Event) {
  const hidden = (event.target as HTMLInputElement).checked;
  if (autoStart.value) {
    await settings.setAutoStart(autoStart.value, hidden);
  }
}

const showEqModal = ref(false);

const electronAvailable = computed(() => Boolean(window.vkmp));

const isCheckingUpdate = ref(false);
async function checkForUpdates() {
  if (!window.vkmp?.updater) return;
  isCheckingUpdate.value = true;
  try {
    await window.vkmp.updater.checkForUpdates();
    ui.notify("Проверка обновлений завершена", "success");
  } catch (err) {
    ui.notify("Ошибка при проверке обновлений", "error");
    console.error(err);
  } finally {
    isCheckingUpdate.value = false;
  }
}
</script>

<template>
  <ScrollArea>
    <PageHeader eyebrow="Настройки" title="Под себя" subtitle="Всё сохраняется локально." />

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
          <h2>Шрифт</h2>
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
          <label class="settings__row" :class="{ 'settings__row--disabled': !electronAvailable }">
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
          <label class="settings__row" :class="{ 'settings__row--disabled': !electronAvailable }">
            <div>
              <div class="settings__row-title">Запуск свернутым</div>
              <div class="settings__row-sub">Подходит для автозапуска — не отвлекает</div>
            </div>
            <input v-model="startMinimized" type="checkbox" class="settings__switch" :disabled="!electronAvailable" @change="onStartMinimizedChange" />
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
          <h2>Обновления</h2>
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
          <p class="settings__hint" style="margin-top: 16px;">Сейчас используется ≈ {{ cacheUsage }} MB на этом ПК.</p>
          <label class="settings__row">
            <div>
              <div class="settings__row-title">Лимит локального кеша</div>
              <div class="settings__row-sub">Цели хранения: индекс библиотеки, рекомендации, последние треки</div>
            </div>
            <div class="settings__range">
              <input v-model.number="cacheSize" type="range" min="50" max="2000" step="50" />
              <span>{{ cacheSize }} MB</span>
            </div>
          </label>
          <div class="settings__row settings__row--actions">
            <button class="btn btn--ghost" @click="clearCache">Очистить кеш</button>
          </div>
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
                {{ auth.status.authenticated ? `id ${auth.status.user_id}` : "Не авторизован" }}
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
  font-size: 15px;
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
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.005em;
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
  font-size: 12px;
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
  font-size: 14px;
  font-weight: 600;
  color: var(--text-0);
}
.settings__style-desc {
  font-size: 12px;
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
  font-size: 13px;
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
  font-size: 14px;
  color: var(--text-0);
  cursor: pointer;
}
.settings__radio input {
  accent-color: var(--accent-1);
}
.settings__color-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
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
  font-size: 11px;
  color: var(--text-2);
}
.settings__font-sample {
  font-size: 24px;
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
  font-size: 12px;
  max-width: 360px;
}

.settings__switch {
  -webkit-appearance: none;
  appearance: none;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  background: var(--bg-3);
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
}
.settings__switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: white;
  transition: transform var(--motion-duration-fast) var(--motion-ease-out);
}
.settings__switch:checked {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
}
.settings__switch:checked::after {
  transform: translateX(18px);
}
.settings__range {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.settings__range input[type="range"] {
  width: 140px;
}
.settings__range span {
  min-width: 70px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
  font-size: 12px;
}
.settings__text-input {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-0);
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  width: 200px;
  outline: none;
  transition: border-color var(--motion-duration-fast);
}
.settings__text-input:focus {
  border-color: var(--accent-1);
}
.settings__hint {
  margin: 0;
  font-size: 12px;
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
</style>
