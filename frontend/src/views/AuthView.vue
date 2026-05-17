<script setup lang="ts">
import { computed } from "vue";
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

const isElectron = computed(() => typeof window !== "undefined" && !!window.vkmp?.openVKAuth);

const cardVariants = computed(() =>
  motion.spring(
    { opacity: 0, y: 24, scale: 0.97 },
    { opacity: 1, y: 0, scale: 1 },
    { stiffness: 220, damping: 22 },
  ),
);

async function signIn() {
  if (loading.value) return;
  const ok = await auth.loginViaOAuth();
  if (ok) {
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/";
    router.replace(redirect);
  }
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

      <div class="auth__pitch">
        <p>
          Один клик — откроется официальная страница входа ВК. Логин/пароль, 2FA или
          вход по QR-коду через VK ID. Приложение получает только токен — пароль никуда
          не пересылается.
        </p>
      </div>

      <button
        class="btn btn--primary auth__submit"
        type="button"
        :disabled="loading || !isElectron"
        @click="signIn"
      >
        <Spinner v-if="loading" :size="16" />
        <span>{{ loading ? "Открываем окно ВК…" : "Войти через ВК" }}</span>
      </button>

      <div v-if="lastError" class="auth__error">{{ lastError }}</div>

      <p v-if="!isElectron" class="auth__warn">
        Этот экран работает только в десктоп-версии (Electron) — в обычном браузере ВК
        не отдаст токен из-за CORS / редиректа.
      </p>

      <p class="auth__note">
        Используется OAuth2 implicit flow клиента Kate Mobile (client_id 2685278). Токен
        живёт локально в файле <code>~/.vk-music-player/session.json</code> с правами 600
        и уходит только в api.vk.com.
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
.auth__pitch {
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.55;
}
.auth__pitch p {
  margin: 0;
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
.auth__note {
  margin: 0;
  color: var(--text-3);
  font-size: 11px;
  line-height: 1.55;
}
.auth__note code {
  background: var(--bg-2);
  padding: 0 4px;
  border-radius: 4px;
}
</style>
