<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useSettingsStore, type AccentName, type ThemeName } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";

const settings = useSettingsStore();
const auth = useAuthStore();
const library = useLibraryStore();
const player = usePlayerStore();
const ui = useUIStore();
const router = useRouter();

const {
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
} = storeToRefs(settings);

const startupVolumePct = computed({
  get: () => Math.round(startupVolume.value * 100),
  set: (v: number) => {
    startupVolume.value = Math.max(0, Math.min(1, v / 100));
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

const accents: { value: AccentName; label: string; preview: string }[] = [
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
];

const cacheUsage = ref<number>(estimateCache());
function estimateCache(): number {
  // localStorage size approximation in MB
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
function pickAccent(value: AccentName) {
  accent.value = value;
}

async function onAutoStartChange(event: Event) {
  const enabled = (event.target as HTMLInputElement).checked;
  await settings.setAutoStart(enabled);
}

const electronAvailable = computed(() => Boolean(window.vkmp));
</script>

<template>
  <ScrollArea>
    <PageHeader eyebrow="Настройки" title="Под себя" subtitle="Темы, производительность и поведение приложения. Всё сохраняется локально." />

    <section class="settings">
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
        <h2>Акцент</h2>
        <div class="settings__grid settings__grid--accents">
          <button
            v-for="a in accents"
            :key="a.value"
            class="settings__accent"
            :class="{ 'settings__accent--active': accent === a.value }"
            :style="{ background: a.preview }"
            :aria-label="a.label"
            @click="pickAccent(a.value)"
          />
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
        <h2>Приложение</h2>
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
          <input v-model="startMinimized" type="checkbox" class="settings__switch" :disabled="!electronAvailable" />
        </label>
        <label class="settings__row">
          <div>
            <div class="settings__row-title">Аппаратное ускорение</div>
            <div class="settings__row-sub">Применится при следующем запуске</div>
          </div>
          <input v-model="hardwareAcceleration" type="checkbox" class="settings__switch" />
        </label>
      </article>

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
      </article>

      <article class="settings__card">
        <h2>Кеш</h2>
        <p class="settings__hint">Сейчас используется ≈ {{ cacheUsage }} MB на этом ПК.</p>
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
          с правами 600. Открытые исходники: <code>backend/</code> + <code>frontend/</code>.
        </p>
      </article>
    </section>
  </ScrollArea>
</template>

<style scoped>
.settings {
  padding: 0 32px 32px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
  gap: 16px;
}
.settings__card {
  padding: 22px 22px 18px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  gap: 12px;
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
  grid-template-columns: repeat(3, 1fr);
}
.settings__grid--accents {
  grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
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
  box-shadow: 0 0 0 2px rgba(26, 140, 255, 0.18);
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
  max-width: 320px;
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
</style>
