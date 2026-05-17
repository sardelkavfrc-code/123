<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useMotion } from "@/composables/useSpring";
import Spinner from "@/components/Spinner.vue";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const motion = useMotion();

const { loading, lastError, challenge } = storeToRefs(auth);

const isElectron = computed(() => typeof window !== "undefined" && !!window.vkmp?.openVKAuth);

const cardVariants = computed(() =>
  motion.spring(
    { opacity: 0, y: 24, scale: 0.97 },
    { opacity: 1, y: 0, scale: 1 },
    { stiffness: 220, damping: 22 },
  ),
);

type Mode = "oauth" | "password";
const mode = ref<Mode>("oauth");

const form = reactive({
  username: "",
  password: "",
  code: "",
  captcha_key: "",
  remember: true,
});

function redirectTarget(): string {
  return typeof route.query.redirect === "string" ? route.query.redirect : "/";
}

async function signInOAuth() {
  if (loading.value) return;
  const ok = await auth.loginViaOAuth();
  if (ok) router.replace(redirectTarget());
}

async function signInPassword() {
  if (loading.value) return;
  if (!form.username || !form.password) return;
  const ch = challenge.value;
  const ok = await auth.login({
    username: form.username,
    password: form.password,
    code: ch?.kind === "need_validation" && form.code ? form.code : undefined,
    captcha_sid: ch?.kind === "need_captcha" && ch.captcha_sid ? ch.captcha_sid : undefined,
    captcha_key: ch?.kind === "need_captcha" && form.captcha_key ? form.captcha_key : undefined,
    remember: form.remember,
  });
  if (ok) router.replace(redirectTarget());
}
</script>

<template>
  <section class="auth">
    <div v-motion="cardVariants" class="auth__card surface">
      <div class="auth__brand">
        <span class="auth__logo accent-gradient" />
        <div>
          <h1 class="auth__title">VK Music</h1>
          <p class="auth__subtitle">
            Полноценный плеер с твоей музыкой ВК — прямо на десктопе
          </p>
        </div>
      </div>

      <div class="auth__tabs" role="tablist">
        <button
          type="button"
          class="auth__tab"
          :class="{ 'auth__tab--active': mode === 'oauth' }"
          @click="mode = 'oauth'"
        >
          Через ВК
        </button>
        <button
          type="button"
          class="auth__tab"
          :class="{ 'auth__tab--active': mode === 'password' }"
          @click="mode = 'password'"
        >
          Логин и пароль
        </button>
      </div>

      <div v-if="mode === 'oauth'" class="auth__pane">
        <p class="auth__pitch">
          Один клик — откроется официальная страница входа ВК. Пароль уходит только
          в ВК, мы получаем готовый токен. Подходит для друзей, поиска людей, профиля.
        </p>
        <p class="auth__warn-inline">
          ⚠ ВК с 2024 не выдаёт через этот поток доступ к аудио. Если нужна музыка
          — используй вкладку «Логин и пароль» (там аудио работает).
        </p>
        <button
          class="btn btn--primary auth__submit"
          type="button"
          :disabled="loading || !isElectron"
          @click="signInOAuth"
        >
          <Spinner v-if="loading" :size="16" />
          <span>{{ loading ? "Открываем окно ВК…" : "Войти через ВК" }}</span>
        </button>
        <p v-if="!isElectron" class="auth__warn">
          Этот вариант работает только в десктоп-версии (Electron) — в браузере ВК не
          отдаст токен из-за CORS / редиректа.
        </p>
      </div>

      <form v-else class="auth__pane" @submit.prevent="signInPassword">
        <p class="auth__pitch">
          Прямой grant Kate Mobile — единственный поток ВК, через который выдаётся
          аудио-доступ. Пароль уходит напрямую в <code>oauth.vk.com/token</code>, у
          нас сохраняется только итоговый токен в <code>~/.vk-music-player/session.json</code>.
        </p>
        <label class="field">
          <span>Логин (телефон или email)</span>
          <input
            v-model="form.username"
            class="input"
            type="text"
            autocomplete="username"
            required
          />
        </label>
        <label class="field">
          <span>Пароль</span>
          <input
            v-model="form.password"
            class="input"
            type="password"
            autocomplete="current-password"
            required
          />
        </label>

        <div v-if="challenge?.kind === 'need_validation'" class="field">
          <label>
            <span>
              Код из СМС / приложения
              <em v-if="challenge.phone_mask">(отправлено на {{ challenge.phone_mask }})</em>
            </span>
            <input v-model="form.code" class="input" type="text" inputmode="numeric" autofocus />
          </label>
        </div>

        <div v-if="challenge?.kind === 'need_captcha' && challenge.captcha_img" class="field">
          <img :src="challenge.captcha_img" alt="captcha" class="auth__captcha" />
          <label>
            <span>Введите код с картинки</span>
            <input v-model="form.captcha_key" class="input" type="text" autofocus />
          </label>
        </div>

        <label class="auth__remember">
          <input v-model="form.remember" type="checkbox" />
          <span>Запомнить меня</span>
        </label>

        <button
          class="btn btn--primary auth__submit"
          type="submit"
          :disabled="loading"
        >
          <Spinner v-if="loading" :size="16" />
          <span>{{ loading ? "Входим…" : "Войти" }}</span>
        </button>

        <p class="auth__warn-inline">
          Если получишь «Слишком много попыток» — VK на 1–24 ч банит этот аккаунт от
          password-grant. Подожди и попробуй ещё раз с верным паролем с первого раза.
        </p>
      </form>

      <div v-if="lastError" class="auth__error">{{ lastError }}</div>
    </div>
  </section>
</template>

<style scoped>
.auth {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-image:
    radial-gradient(900px 540px at 20% 10%, rgba(26, 140, 255, 0.22), transparent 60%),
    radial-gradient(700px 540px at 80% 100%, rgba(201, 48, 255, 0.18), transparent 60%);
}
.auth__card {
  width: 100%;
  max-width: 460px;
  padding: 30px 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.auth__brand {
  display: flex;
  align-items: center;
  gap: 14px;
}
.auth__logo {
  width: 44px;
  height: 44px;
  border-radius: 12px;
}
.auth__title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}
.auth__subtitle {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: 13px;
}
.auth__tabs {
  display: inline-flex;
  background: var(--bg-2);
  border-radius: var(--radius-md);
  padding: 4px;
  gap: 4px;
  align-self: flex-start;
}
.auth__tab {
  border: 0;
  background: transparent;
  color: var(--text-2);
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  border-radius: calc(var(--radius-md) - 4px);
  cursor: pointer;
  transition: background var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
}
.auth__tab--active {
  background: var(--bg-0);
  color: var(--text-0);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
}
.auth__pane {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.auth__pitch {
  margin: 0;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.55;
}
.auth__pitch code {
  background: var(--bg-2);
  padding: 0 4px;
  border-radius: 4px;
  font-size: 12px;
}
.auth__warn-inline {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  line-height: 1.5;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.field span em {
  font-style: normal;
  color: var(--text-3);
}
.auth__captcha {
  align-self: flex-start;
  border-radius: 6px;
  margin-bottom: 4px;
  max-width: 220px;
}
.auth__remember {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.auth__error {
  color: var(--danger);
  font-size: 12px;
}
.auth__warn {
  margin: 0;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.55;
}
.auth__submit {
  margin-top: 4px;
  width: 100%;
  font-size: 15px;
  padding: 14px 16px;
}
</style>
