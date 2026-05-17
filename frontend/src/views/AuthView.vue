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

const form = reactive({
  username: "",
  password: "",
});
const code = ref("");
const captchaKey = ref("");

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

async function submit() {
  if (loading.value) return;
  if (!form.username.trim() || !form.password) return;

  const payload: Parameters<typeof auth.login>[0] = {
    username: form.username.trim(),
    password: form.password,
    remember: true,
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

watch(challenge, (next, prev) => {
  // When VK swaps the captcha (e.g. user typed wrong characters) we reset the
  // input so the user types fresh — same for the SMS code after a new send.
  if (!next) return;
  if (prev?.captcha_sid !== next.captcha_sid) captchaKey.value = "";
  if (prev?.validation_sid !== next.validation_sid) code.value = "";
});
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

      <form class="auth__form" @submit.prevent="submit">
        <p class="auth__pitch">
          Вход через Kate Mobile (прямой запрос к
          <code>oauth.vk.com/token</code>). Единственный способ получить
          токен с аудио-доступом: обычный OAuth-вход на сайте ВК с 2024 даёт
          токен, у которого audio.* возвращает «Unknown method passed».
          Пароль никуда, кроме официальных серверов ВК, не уходит.
        </p>

        <label class="auth__field">
          <span>Телефон или email</span>
          <input
            v-model="form.username"
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
            v-model="form.password"
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
          :disabled="loading || !form.username || !form.password"
        >
          <Spinner v-if="loading" :size="16" />
          <span>{{ loading ? "Входим…" : "Войти" }}</span>
        </button>

        <p v-if="lastError" class="auth__error">{{ lastError }}</p>

        <p class="auth__pitch auth__pitch--muted">
          Если ВК отдаёт «Too many tries» / «Flood control» — это лимит
          на стороне ВК на аккаунт после нескольких неудачных попыток.
          Подожди несколько часов и попробуй снова.
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
