<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
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

type TabId = "password" | "oauth" | "token";
const tab = ref<TabId>("password");

interface VKClientOption {
  id: string;
  name: string;
  clientId: number;
  hint: string;
}

// Each VK client gets a per-(account, client_id) rate-limit on direct
// grant — switching here is often enough to unstick a "Too many tries"
// error. Kate Mobile is the de-facto default for audio-capable tokens.
const VK_CLIENTS: VKClientOption[] = [
  {
    id: "kate_mobile",
    name: "Kate Mobile",
    clientId: 2685278,
    hint: "Дефолт. Чаще всего отдаёт токен с audio.",
  },
  {
    id: "vk_admin",
    name: "VK Admin",
    clientId: 6121396,
    hint: "Резервный клиент — попробуй, если Kate Mobile залочило.",
  },
  {
    id: "vk_iphone",
    name: "VK для iPhone",
    clientId: 3140623,
    hint: "Иногда работает там, где Android-клиенты не пускают.",
  },
  {
    id: "vk_android",
    name: "VK для Android",
    clientId: 2274003,
    hint: "Официальное мобильное приложение.",
  },
];

const passwordForm = reactive({
  username: "",
  password: "",
  client: VK_CLIENTS[0].id,
});
const code = ref("");
const captchaKey = ref("");

const oauthClient = ref<string>(VK_CLIENTS[0].id);

const tokenForm = reactive({
  accessToken: "",
  userId: "",
});

function clientByOptionId(id: string): VKClientOption {
  return VK_CLIENTS.find((c) => c.id === id) ?? VK_CLIENTS[0];
}

const cardVariants = computed(() =>
  motion.spring(
    { opacity: 0, y: 24, scale: 0.97 },
    { opacity: 1, y: 0, scale: 1 },
    { stiffness: 220, damping: 22 },
  ),
);

const isValidating = computed(() => challenge.value?.kind === "need_validation");
const needsCaptcha = computed(() => challenge.value?.kind === "need_captcha");
const challengeMessage = computed(() => challenge.value?.message ?? "");

function redirectTarget(): string {
  return typeof route.query.redirect === "string" ? route.query.redirect : "/";
}

function setTab(next: TabId) {
  if (tab.value === next) return;
  tab.value = next;
  auth.clearChallenge();
  code.value = "";
  captchaKey.value = "";
}

async function submitPassword() {
  if (loading.value) return;
  if (!passwordForm.username.trim() || !passwordForm.password) return;

  const payload: Parameters<typeof auth.login>[0] = {
    username: passwordForm.username.trim(),
    password: passwordForm.password,
    remember: true,
    client: passwordForm.client,
  };
  if (isValidating.value && code.value) {
    payload.code = code.value.trim();
  }
  if (needsCaptcha.value && challenge.value?.captcha_sid && captchaKey.value) {
    payload.captcha_sid = challenge.value.captcha_sid;
    payload.captcha_key = captchaKey.value.trim();
  }

  const ok = await auth.login(payload);
  if (ok) {
    code.value = "";
    captchaKey.value = "";
    router.replace(redirectTarget());
  }
}

async function submitOAuth() {
  if (loading.value) return;
  const client = clientByOptionId(oauthClient.value);
  const ok = await auth.loginViaOAuth(client.clientId);
  if (ok) {
    router.replace(redirectTarget());
  }
}

async function submitToken() {
  if (loading.value) return;
  const token = tokenForm.accessToken.trim();
  if (!token) return;
  const userIdRaw = tokenForm.userId.trim();
  const userId = userIdRaw ? Number(userIdRaw) : undefined;
  const ok = await auth.loginWithToken({
    access_token: token,
    user_id: Number.isFinite(userId) ? userId : undefined,
    remember: true,
  });
  if (ok) {
    router.replace(redirectTarget());
  }
}

watch(challenge, (next, prev) => {
  if (!next) return;
  if (prev?.captcha_sid !== next.captcha_sid) captchaKey.value = "";
  if (prev?.validation_sid !== next.validation_sid) code.value = "";
});

const hasElectron = typeof window !== "undefined" && !!window.vkmp?.openVKAuth;
</script>

<template>
  <section class="auth">
    <div v-motion="cardVariants" class="auth__card surface">
      <div class="auth__brand">
        <span class="auth__logo accent-gradient" />
        <div>
          <h1 class="auth__title">VK Music</h1>
          <p class="auth__subtitle">
            Несколько способов входа — выбери тот, на котором VK не флудоконтролит твой аккаунт
          </p>
        </div>
      </div>

      <div class="auth__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'password'"
          class="auth__tab"
          :class="{ 'auth__tab--active': tab === 'password' }"
          @click="setTab('password')"
        >
          Логин/пароль
        </button>
        <button
          v-if="hasElectron"
          type="button"
          role="tab"
          :aria-selected="tab === 'oauth'"
          class="auth__tab"
          :class="{ 'auth__tab--active': tab === 'oauth' }"
          @click="setTab('oauth')"
        >
          Окно ВК
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'token'"
          class="auth__tab"
          :class="{ 'auth__tab--active': tab === 'token' }"
          @click="setTab('token')"
        >
          Готовый токен
        </button>
      </div>

      <form v-if="tab === 'password'" class="auth__form" @submit.prevent="submitPassword">
        <p class="auth__pitch">
          Прямой запрос к <code>oauth.vk.com/token</code> под одним из мобильных клиентов ВК
          (то же, что делают Kate Mobile / vk-audio-token). Пароль никуда, кроме серверов ВК,
          не уходит.
        </p>

        <label class="auth__field">
          <span>Клиент ВК</span>
          <select
            v-model="passwordForm.client"
            :disabled="loading"
            class="auth__select"
          >
            <option v-for="option in VK_CLIENTS" :key="option.id" :value="option.id">
              {{ option.name }}
            </option>
          </select>
          <p class="auth__hint">{{ clientByOptionId(passwordForm.client).hint }}</p>
        </label>

        <label class="auth__field">
          <span>Телефон или email</span>
          <input
            v-model="passwordForm.username"
            type="text"
            autocomplete="username"
            placeholder="+79991234567"
            :disabled="loading"
            required
          />
        </label>

        <label class="auth__field">
          <span>Пароль ВК</span>
          <input
            v-model="passwordForm.password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            :disabled="loading"
            required
          />
        </label>

        <label v-if="isValidating" class="auth__field auth__field--challenge">
          <span>
            Код подтверждения{{ challenge?.phone_mask ? ` (${challenge.phone_mask})` : "" }}
          </span>
          <input
            v-model="code"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="123456"
            :disabled="loading"
            required
          />
          <p class="auth__hint">{{ challengeMessage }}</p>
        </label>

        <div v-if="needsCaptcha" class="auth__captcha">
          <img
            v-if="challenge?.captcha_img"
            :src="challenge.captcha_img"
            alt="Капча ВК"
            class="auth__captcha-img"
          />
          <label class="auth__field">
            <span>Введи капчу с картинки</span>
            <input
              v-model="captchaKey"
              type="text"
              autocomplete="off"
              :disabled="loading"
              required
            />
            <p class="auth__hint">{{ challengeMessage }}</p>
          </label>
        </div>

        <button
          class="btn btn--primary auth__submit"
          type="submit"
          :disabled="loading || !passwordForm.username || !passwordForm.password"
        >
          <Spinner v-if="loading" :size="16" />
          <span>{{ loading ? "Входим…" : "Войти" }}</span>
        </button>

        <p v-if="lastError" class="auth__error">{{ lastError }}</p>

        <p class="auth__pitch auth__pitch--muted">
          «Too many tries» / «Flood control» — ВК закрывает дверь для пары (клиент, аккаунт)
          на несколько часов. Сначала попробуй сменить клиент сверху, потом подожди и
          попробуй заново.
        </p>
      </form>

      <form v-else-if="tab === 'oauth'" class="auth__form" @submit.prevent="submitOAuth">
        <p class="auth__pitch">
          Откроется мобильное окно <code>oauth.vk.com/authorize</code>. Логинишься как угодно —
          паролем, QR-кодом через приложение, или через VK ID. Токен мы забираем из редиректа
          и просим у VK блессинг через FCM-чек Kate Mobile.
        </p>
        <p class="auth__pitch auth__pitch--warn">
          На большинстве аккаунтов в 2026 у токенов из этого окна audio.* возвращает «Unknown
          method passed» — VK закрыл аудио-скоуп для implicit-флоу. Если на твоём всё-таки
          работает, это самый удобный способ. Если нет — переключайся на «Логин/пароль».
        </p>

        <label class="auth__field">
          <span>Клиент ВК</span>
          <select
            v-model="oauthClient"
            :disabled="loading"
            class="auth__select"
          >
            <option v-for="option in VK_CLIENTS" :key="option.id" :value="option.id">
              {{ option.name }}
            </option>
          </select>
          <p class="auth__hint">{{ clientByOptionId(oauthClient).hint }}</p>
        </label>

        <button
          class="btn btn--primary auth__submit"
          type="submit"
          :disabled="loading"
        >
          <Spinner v-if="loading" :size="16" />
          <span>{{ loading ? "Ждём окно…" : "Открыть окно ВК" }}</span>
        </button>

        <p v-if="lastError" class="auth__error">{{ lastError }}</p>
      </form>

      <form v-else class="auth__form" @submit.prevent="submitToken">
        <p class="auth__pitch">
          Если у тебя уже есть готовый <code>access_token</code> (vkhost.github.io,
          VK Admin, расширения браузера, чужое приложение) — вставь сюда. Мы попытаемся
          прокрутить его через FCM-receipt чтобы поднять до audio-скоупа, но если токен
          implicit-флоу — audio.* всё равно может не работать.
        </p>

        <label class="auth__field">
          <span>access_token</span>
          <textarea
            v-model="tokenForm.accessToken"
            rows="3"
            placeholder="vk1.a.…"
            autocomplete="off"
            spellcheck="false"
            :disabled="loading"
            class="auth__textarea"
            required
          />
        </label>

        <label class="auth__field">
          <span>user_id (необязательно — определим автоматически)</span>
          <input
            v-model="tokenForm.userId"
            type="text"
            inputmode="numeric"
            placeholder="123456789"
            autocomplete="off"
            :disabled="loading"
          />
        </label>

        <button
          class="btn btn--primary auth__submit"
          type="submit"
          :disabled="loading || !tokenForm.accessToken.trim()"
        >
          <Spinner v-if="loading" :size="16" />
          <span>{{ loading ? "Проверяем токен…" : "Войти по токену" }}</span>
        </button>

        <p v-if="lastError" class="auth__error">{{ lastError }}</p>

        <p class="auth__pitch auth__pitch--muted">
          Где взять токен: <a href="https://vkhost.github.io/" target="_blank" rel="noreferrer">
            vkhost.github.io
          </a>. Выбираешь приложение (Kate Mobile / VK Admin / VK Music и т.п.), даёшь доступ,
          вытаскиваешь <code>access_token</code> из URL.
        </p>
      </form>
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
.auth__form {
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
.auth__pitch--muted {
  color: var(--text-3);
  font-size: 12px;
}
.auth__pitch--warn {
  color: var(--warning, #f1c248);
}
.auth__pitch a {
  color: var(--accent);
}
.auth__tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-2);
  border-radius: 12px;
  border: 1px solid var(--border-1);
}
.auth__tab {
  flex: 1 1 0;
  padding: 9px 10px;
  border: none;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  border-radius: 9px;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.auth__tab:hover {
  color: var(--text-1);
}
.auth__tab--active {
  background: var(--bg-1);
  color: var(--text-1);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04);
}
.auth__select {
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  color: var(--text-1);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
}
.auth__select:focus {
  outline: none;
  border-color: var(--accent);
}
.auth__textarea {
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  color: var(--text-1);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  resize: vertical;
  min-height: 60px;
}
.auth__textarea:focus {
  outline: none;
  border-color: var(--accent);
}
.auth__pitch code {
  background: var(--bg-2);
  padding: 0 4px;
  border-radius: 4px;
  font-size: 12px;
}
.auth__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: var(--text-2);
}
.auth__field input {
  background: var(--bg-2);
  border: 1px solid var(--border-1);
  color: var(--text-1);
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 14px;
  transition: border-color 120ms ease;
}
.auth__field input:focus {
  outline: none;
  border-color: var(--accent);
}
.auth__field--challenge {
  background: rgba(26, 140, 255, 0.06);
  border: 1px solid rgba(26, 140, 255, 0.18);
  padding: 12px;
  border-radius: 12px;
}
.auth__captcha {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 196, 0, 0.06);
  border: 1px solid rgba(255, 196, 0, 0.22);
}
.auth__captcha-img {
  align-self: flex-start;
  max-width: 200px;
  border-radius: 6px;
  background: var(--bg-2);
}
.auth__hint {
  margin: 0;
  color: var(--text-3);
  font-size: 11px;
}
.auth__error {
  margin: 0;
  color: var(--danger);
  font-size: 12px;
}
.auth__submit {
  margin-top: 4px;
  width: 100%;
  font-size: 15px;
  padding: 14px 16px;
}
</style>
