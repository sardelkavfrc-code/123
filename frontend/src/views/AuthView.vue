<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useMotion } from "@/composables/useSpring";
import Spinner from "@/components/Spinner.vue";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const motion = useMotion();

const { loading, lastError } = storeToRefs(auth);

const showManual = ref(false);
const manualUrl = ref("");

function parseOAuthFragment(rawUrl: string) {
  const hashIndex = rawUrl.indexOf("#");
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(rawUrl.slice(hashIndex + 1));
  const error = params.get("error");
  if (error) return { ok: false, error: params.get("error_description") || error };
  const token = params.get("access_token");
  if (!token) return null;
  return {
    ok: true,
    access_token: token,
    user_id: Number(params.get("user_id") || 0),
  };
}

async function submitManual() {
  const parsed = parseOAuthFragment(manualUrl.value);
  if (!parsed || !parsed.ok) {
    lastError.value = parsed?.error || "Неверная ссылка или токен не найден";
    return;
  }
  const ok = await auth.loginWithToken({
    access_token: parsed.access_token as string,
    user_id: parsed.user_id,
  });
  if (ok) router.replace(redirectTarget());
}

const cardVariants = computed(() =>
  motion.spring(
    { opacity: 0, y: 24, scale: 0.97 },
    { opacity: 1, y: 0, scale: 1 },
    { stiffness: 220, damping: 22 },
  ),
);

function redirectTarget(): string {
  return typeof route.query.redirect === "string" ? route.query.redirect : "/";
}

const hasElectron = typeof window !== "undefined" && !!window.vkmp?.openVKAuth;

async function submit() {
  if (loading.value) return;
  if (!hasElectron) return;
  const ok = await auth.loginViaOAuth();
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
            Один клик — окно ВК — поехали. Никаких форм и токенов.
          </p>
        </div>
      </div>

      <button
        v-if="hasElectron"
        class="btn btn--primary auth__submit"
        type="button"
        :disabled="loading"
        @click="submit"
      >
        <Spinner v-if="loading" :size="18" />
        <span>{{ loading ? "Ждём окно ВК…" : "Войти через ВК" }}</span>
      </button>
      <div v-if="!showManual" class="auth__fallback-link">
        <a href="#" @click.prevent="showManual = true">Окно закрывается с ошибкой (network error)?</a>
      </div>

      <div v-if="showManual" class="auth__manual">
        <p class="auth__pitch">
          1. Открой <a target="_blank" href="https://oauth.vk.com/authorize?client_id=6287487&scope=1073737727&redirect_uri=https%3A%2F%2Foauth.vk.com%2Fblank.html&display=page&v=5.131&response_type=token&revoke=1">эту ссылку</a> в браузере.<br/>
          2. Разреши доступ (откроется белая страница с предупреждением).<br/>
          3. Скопируй адрес из адресной строки и вставь сюда:
        </p>
        <div class="auth__manual-row">
          <input v-model="manualUrl" class="input auth__manual-input" placeholder="https://oauth.vk.com/blank.html#access_token=..." />
          <button class="btn btn--primary" :disabled="!manualUrl" @click="submitManual">Ок</button>
        </div>
      </div>

      <p v-if="lastError" class="auth__error">{{ lastError }}</p>

      <p class="auth__pitch auth__pitch--muted">
        Откроется официальное окно <code>oauth.vk.com</code>. Логинься как удобно
        (пароль, QR-код, VK ID) — токен мы заберём из редиректа и сохраним
        локально, в зашифрованных папках пользователя.
      </p>
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
    radial-gradient(900px 540px at 20% 10%, color-mix(in srgb, var(--accent-1) 22%, transparent), transparent 60%),
    radial-gradient(700px 540px at 80% 100%, color-mix(in srgb, var(--accent-3) 18%, transparent), transparent 60%);
}
.auth__card {
  width: 100%;
  max-width: 460px;
  padding: 32px 28px 26px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.auth__brand {
  display: flex;
  align-items: center;
  gap: 14px;
}
.auth__logo {
  width: 48px;
  height: 48px;
  border-radius: 14px;
}
.auth__title {
  margin: 0;
  font-size: calc(24px * var(--font-scale, 1));
  font-weight: 700;
}
.auth__subtitle {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
}
.auth__pitch {
  margin: 0;
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
  line-height: 1.55;
}
.auth__pitch--muted {
  color: var(--text-3);
  font-size: calc(12px * var(--font-scale, 1));
}
.auth__pitch code {
  background: var(--bg-2);
  padding: 0 4px;
  border-radius: 4px;
  font-size: calc(12px * var(--font-scale, 1));
}
.auth__error {
  margin: 0;
  color: var(--danger);
  font-size: calc(13px * var(--font-scale, 1));
}
.auth__submit {
  width: 100%;
  font-size: calc(15px * var(--font-scale, 1));
  padding: 14px 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.auth__fallback-link {
  text-align: center;
  font-size: calc(13px * var(--font-scale, 1));
}
.auth__fallback-link a {
  color: var(--text-2);
  text-decoration: underline;
  text-decoration-color: transparent;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
}
.auth__fallback-link a:hover {
  color: var(--text-0);
  text-decoration-color: var(--text-0);
}
.auth__manual {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--bg-2);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border);
}
.auth__manual a {
  color: var(--accent-1);
}
.auth__manual a:hover {
  text-decoration: underline;
}
.auth__manual-row {
  display: flex;
  gap: 8px;
}
.auth__manual-input {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
