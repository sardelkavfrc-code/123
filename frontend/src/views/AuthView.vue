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

const { loading, challenge, lastError } = storeToRefs(auth);

type Mode = "password" | "token";
const mode = ref<Mode>("password");

const form = reactive({
  username: "",
  password: "",
  code: "",
  captcha_key: "",
  token: "",
  remember: true,
});

const showCaptcha = computed(() => challenge.value?.kind === "need_captcha");
const showValidation = computed(() => challenge.value?.kind === "need_validation");

const cardVariants = computed(() =>
  motion.spring({ opacity: 0, y: 24, scale: 0.97 }, { opacity: 1, y: 0, scale: 1 }, { stiffness: 220, damping: 22 })
);

async function submit() {
  if (loading.value) return;
  let ok = false;
  if (mode.value === "password") {
    ok = await auth.login({
      username: form.username.trim(),
      password: form.password,
      code: form.code ? form.code.trim() : undefined,
      captcha_sid: challenge.value?.captcha_sid ?? undefined,
      captcha_key: form.captcha_key ? form.captcha_key.trim() : undefined,
    });
  } else {
    ok = await auth.loginWithToken({
      access_token: form.token.trim(),
      remember: form.remember,
    });
  }
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
          <p class="auth__subtitle">Полноценный плеер с твоей музыкой ВК — прямо на десктопе</p>
        </div>
      </div>

      <div class="auth__modes">
        <button
          class="chip"
          :class="{ 'chip--active': mode === 'password' }"
          @click="mode = 'password'"
        >
          Логин / пароль
        </button>
        <button class="chip" :class="{ 'chip--active': mode === 'token' }" @click="mode = 'token'">
          Готовый токен
        </button>
      </div>

      <form class="auth__form" @submit.prevent="submit">
        <template v-if="mode === 'password'">
          <label class="auth__field">
            <span>Логин (телефон или email)</span>
            <input v-model="form.username" type="text" autocomplete="username" required class="input" />
          </label>
          <label class="auth__field">
            <span>Пароль</span>
            <input
              v-model="form.password"
              type="password"
              autocomplete="current-password"
              required
              class="input"
            />
          </label>
          <label v-if="showValidation" class="auth__field">
            <span>
              Код из SMS<span v-if="challenge?.phone_mask"> ({{ challenge.phone_mask }})</span>
            </span>
            <input v-model="form.code" type="text" inputmode="numeric" class="input" />
          </label>
          <template v-if="showCaptcha">
            <div class="auth__captcha">
              <img :src="challenge?.captcha_img ?? ''" alt="captcha" />
            </div>
            <label class="auth__field">
              <span>Капча</span>
              <input v-model="form.captcha_key" type="text" required class="input" />
            </label>
          </template>
        </template>
        <template v-else>
          <label class="auth__field">
            <span>access_token (Kate Mobile / VK Admin)</span>
            <input v-model="form.token" type="text" class="input" autocomplete="off" required />
          </label>
          <label class="auth__check">
            <input v-model="form.remember" type="checkbox" />
            <span>Запомнить токен на этом компьютере</span>
          </label>
        </template>

        <div v-if="lastError" class="auth__error">{{ lastError }}</div>

        <button class="btn btn--primary auth__submit" type="submit" :disabled="loading">
          <Spinner v-if="loading" :size="16" />
          <span>{{ mode === "password" ? "Войти" : "Подключить" }}</span>
        </button>
      </form>

      <p class="auth__note">
        Используется direct token grant клиента Kate Mobile. ВК официально закрыл audio API для
        сторонних приложений — токен живёт в файле <code>~/.vk-music-player/session.json</code> с
        правами 600 и используется только для запросов к VK API.
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
.auth__modes {
  display: flex;
  gap: 8px;
}
.auth__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.auth__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--text-2);
}
.auth__field span {
  font-weight: 500;
}
.auth__check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-1);
}
.auth__captcha {
  display: flex;
  justify-content: center;
}
.auth__captcha img {
  max-width: 100%;
  border-radius: 8px;
}
.auth__error {
  color: var(--danger);
  font-size: 12px;
}
.auth__submit {
  margin-top: 4px;
  width: 100%;
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
