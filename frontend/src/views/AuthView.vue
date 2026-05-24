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
      <div v-else class="auth__error">
        Это окно появляется только в десктоп-сборке. Запусти приложение из установщика.
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
    radial-gradient(900px 540px at 20% 10%, rgba(26, 140, 255, 0.22), transparent 60%),
    radial-gradient(700px 540px at 80% 100%, rgba(201, 48, 255, 0.18), transparent 60%);
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
  font-size: 24px;
  font-weight: 700;
}
.auth__subtitle {
  margin: 4px 0 0;
  color: var(--text-2);
  font-size: 13px;
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
.auth__pitch code {
  background: var(--bg-2);
  padding: 0 4px;
  border-radius: 4px;
  font-size: 12px;
}
.auth__error {
  margin: 0;
  color: var(--danger);
  font-size: 13px;
}
.auth__submit {
  width: 100%;
  font-size: 15px;
  padding: 14px 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
</style>
