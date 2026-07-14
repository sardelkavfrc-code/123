<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useMotion } from "@/composables/useSpring";
import Spinner from "@/components/Spinner.vue";
import { APIError } from "@/api/client";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const motion = useMotion();

const { loading, lastError } = storeToRefs(auth);

// Flow State
type AuthStep = "login" | "callreset" | "sms" | "password" | "email";
const step = ref<AuthStep>("login");

const loginInput = ref("");
const codeInput = ref("");
const passwordInput = ref("");

// Verification Session State
const sid = ref("");
const hasAnotherWays = ref(false);

// Captcha State
const captchaSid = ref<string | null>(null);
const captchaImg = ref<string | null>(null);
const captchaKey = ref("");

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

function resetFlow() {
  step.value = "login";
  codeInput.value = "";
  passwordInput.value = "";
  captchaSid.value = null;
  captchaImg.value = null;
  captchaKey.value = "";
  lastError.value = null;
}

async function handleValidationResponse(res: any) {
  if (res && res.sid) {
    sid.value = res.sid;
    hasAnotherWays.value = res.next_step?.has_another_verification_methods || false;
    
    const method = res.next_step?.verification_method;
    if (method === "callreset") {
      try {
        await auth.sendCallreset({ sid: res.sid });
      } catch (err) {
        // ignore, error displayed by Pinia
      }
      step.value = "callreset";
    } else if (method === "sms") {
      try {
        await auth.sendOtpSms({ sid: res.sid });
      } catch (err) {
        // ignore, error displayed by Pinia
      }
      step.value = "sms";
    } else if (method === "email") {
      try {
        await auth.sendEmail({ sid: res.sid });
      } catch (err) {
        // ignore, error displayed by Pinia
      }
      step.value = "email";
    } else if (method === "password") {
      step.value = "password";
    } else {
      lastError.value = "Неизвестный метод проверки: " + method;
    }
  }
}

// Step 1: Submit email/phone
async function handleLoginSubmit() {
  if (loading.value) return;
  lastError.value = null;
  
  try {
    const res = await auth.validateAccount({
      login: loginInput.value,
      captcha_sid: captchaSid.value || undefined,
      captcha_key: captchaKey.value || undefined,
    });
    await handleValidationResponse(res);
  } catch (err) {
    if (err instanceof APIError) {
      if (err.detail?.redirect_uri) {
        try {
          const successToken = await (window as any).vkmp.openVKValidation(err.detail.redirect_uri);
          if (successToken) {
            const res = await auth.validateAccount({
              login: loginInput.value,
              success_token: successToken,
              captcha_sid: err.detail.captcha_sid || undefined,
            });
            await handleValidationResponse(res);
          } else {
            lastError.value = "Подтверждение входа отменено";
          }
        } catch (valErr) {
          lastError.value = "Ошибка при подтверждении входа: " + (valErr as Error).message;
        }
        return;
      }
      
      if (err.detail?.code === 14) {
        captchaSid.value = err.detail.captcha_sid || null;
        captchaImg.value = err.detail.captcha_img || null;
        captchaKey.value = "";
      }
    }
  }
}

// Request fallback to SMS (Scenario A button)
async function requestSmsCode() {
  if (loading.value || !sid.value) return;
  try {
    await auth.sendOtpSms({ sid: sid.value });
    step.value = "sms";
    codeInput.value = "";
  } catch (err) {
    // Error is handled by Pinia store and displayed in lastError
  }
}

// Step 3: Check OTP Code
async function handleCodeSubmit() {
  if (loading.value || !sid.value) return;
  lastError.value = null;

  try {
    const res = await auth.checkOtp({
      sid: sid.value,
      code: codeInput.value,
      verification_method: step.value === "callreset" ? "callreset" : step.value === "email" ? "email" : "sms",
    });

    if (res) {
      const grantType = res.auth_code ? "auth_code" : "phone_code";
      const codeValue = res.auth_code || codeInput.value;

      const ok = await auth.confirmAuth({
        grant_type: grantType,
        username: loginInput.value,
        code: codeValue,
        sid: sid.value,
        remember: true,
      });

      if (ok) {
        router.replace(redirectTarget());
      }
    }
  } catch (err) {
    // Handled by Pinia store
  }
}

// Step 4: Submit password (for Scenario В)
async function handlePasswordSubmit() {
  if (loading.value) return;
  lastError.value = null;

  const ok = await auth.confirmAuth({
    grant_type: "password",
    username: loginInput.value,
    password: passwordInput.value,
    remember: true,
  });

  if (ok) {
    router.replace(redirectTarget());
  }
}
</script>

<template>
  <section class="auth">
    <div v-motion="cardVariants" class="auth__card surface">
      <div class="auth__brand">
        <span class="auth__logo accent-gradient" />
        <div>
          <h1 class="auth__title">Вход в VK Music</h1>
          <p class="auth__subtitle">
            Авторизация через официальный Android-клиент
          </p>
        </div>
      </div>

      <!-- Step 1: Login Input (Phone/Email) + Captcha -->
      <form v-if="step === 'login'" @submit.prevent="handleLoginSubmit" class="auth__form">
        <p class="auth__instructions">
          Введите ваш номер телефона или адрес электронной почты, привязанный к аккаунту ВКонтакте.
        </p>
        
        <div class="form-group">
          <input
            v-model="loginInput"
            type="text"
            class="input auth__input"
            placeholder="Телефон или Email"
            :disabled="loading"
            required
            autofocus
          />
        </div>

        <!-- Captcha Section if required -->
        <div v-if="captchaImg" class="auth__captcha">
          <p class="auth__instructions auth__instructions--captcha">Введите код с картинки:</p>
          <div class="auth__captcha-wrapper">
            <img :src="captchaImg" alt="Captcha" class="auth__captcha-img" />
            <input
              v-model="captchaKey"
              type="text"
              class="input auth__captcha-input"
              placeholder="Код капчи"
              :disabled="loading"
              required
            />
          </div>
        </div>

        <button class="btn btn--primary auth__submit" type="submit" :disabled="loading || !loginInput">
          <Spinner v-if="loading" :size="18" />
          <span>{{ loading ? "Проверка аккаунта..." : "Войти" }}</span>
        </button>
      </form>

      <!-- Scenario A: Call Reset -->
      <form v-else-if="step === 'callreset'" @submit.prevent="handleCodeSubmit" class="auth__form">
        <p class="auth__instructions">
          Вам звонят на привязанный номер телефона.<br />
          <strong>Введите последние 6 цифр</strong> номера, который вам только что позвонил.
        </p>

        <div class="form-group">
          <input
            v-model="codeInput"
            type="text"
            maxlength="6"
            class="input auth__input auth__input--code"
            placeholder="000000"
            :disabled="loading"
            required
            autofocus
          />
        </div>

        <div class="auth__actions">
          <button class="btn btn--primary auth__submit" type="submit" :disabled="loading || codeInput.length < 4">
            <Spinner v-if="loading" :size="18" />
            <span>{{ loading ? "Проверка..." : "Подтвердить" }}</span>
          </button>

          <button
            v-if="hasAnotherWays"
            type="button"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading"
            @click="requestSmsCode"
          >
            Отправить код по SMS
          </button>

          <button
            type="button"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading"
            @click="step = 'password'"
          >
            Войти с помощью пароля
          </button>
        </div>
      </form>

      <!-- Scenario B: SMS Code -->
      <form v-else-if="step === 'sms'" @submit.prevent="handleCodeSubmit" class="auth__form">
        <p class="auth__instructions">
          Мы отправили SMS с кодом подтверждения на ваш телефон.
        </p>

        <div class="form-group">
          <input
            v-model="codeInput"
            type="text"
            class="input auth__input auth__input--code"
            placeholder="Код из SMS"
            :disabled="loading"
            required
            autofocus
          />
        </div>

        <div class="auth__actions">
          <button class="btn btn--primary auth__submit" type="submit" :disabled="loading || !codeInput">
            <Spinner v-if="loading" :size="18" />
            <span>{{ loading ? "Проверка..." : "Подтвердить" }}</span>
          </button>

          <button
            type="button"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading"
            @click="step = 'password'"
          >
            Войти с помощью пароля
          </button>
        </div>
      </form>

      <!-- Scenario Г: Email Code -->
      <form v-else-if="step === 'email'" @submit.prevent="handleCodeSubmit" class="auth__form">
        <p class="auth__instructions">
          Код подтверждения был отправлен на вашу электронную почту.
        </p>

        <div class="form-group">
          <input
            v-model="codeInput"
            type="text"
            class="input auth__input auth__input--code"
            placeholder="Код подтверждения"
            :disabled="loading"
            required
            autofocus
          />
        </div>

        <div class="auth__actions">
          <button class="btn btn--primary auth__submit" type="submit" :disabled="loading || !codeInput">
            <Spinner v-if="loading" :size="18" />
            <span>{{ loading ? "Проверка..." : "Подтвердить" }}</span>
          </button>

          <button
            type="button"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading"
            @click="step = 'password'"
          >
            Войти с помощью пароля
          </button>
        </div>
      </form>

      <!-- Scenario В: Password -->
      <form v-else-if="step === 'password'" @submit.prevent="handlePasswordSubmit" class="auth__form">
        <p class="auth__instructions">
          ВКонтакте требует пароль для входа в ваш аккаунт.
        </p>

        <div class="form-group">
          <input
            v-model="passwordInput"
            type="password"
            class="input auth__input"
            placeholder="Пароль"
            :disabled="loading"
            required
            autofocus
          />
        </div>

        <button class="btn btn--primary auth__submit" type="submit" :disabled="loading || !passwordInput">
          <Spinner v-if="loading" :size="18" />
          <span>{{ loading ? "Проверка..." : "Войти" }}</span>
        </button>
      </form>

      <!-- Error Display -->
      <p v-if="lastError" class="auth__error">{{ lastError }}</p>

      <!-- Back Link -->
      <div v-if="step !== 'login'" class="auth__back">
        <a href="#" @click.prevent="resetFlow">← Назад к вводу логина</a>
      </div>

      <p class="auth__pitch auth__pitch--muted">
        Мы маскируемся под официальное приложение VK for Android. Ваши учетные данные передаются напрямую на сервера ВКонтакте и сохраняются исключительно локально на вашем устройстве.
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
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
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
.auth__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.auth__instructions {
  margin: 0;
  color: var(--text-2);
  font-size: calc(14px * var(--font-scale, 1));
  line-height: 1.5;
}
.auth__instructions--captcha {
  font-size: calc(13px * var(--font-scale, 1));
  margin-bottom: 6px;
  color: var(--text-1);
}
.auth__input {
  width: 100%;
  font-size: calc(16px * var(--font-scale, 1));
  padding: 12px 16px;
}
.auth__input--code {
  letter-spacing: 4px;
  text-align: center;
  font-size: calc(20px * var(--font-scale, 1));
  font-weight: 700;
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
.auth__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.auth__secondary-btn {
  width: 100%;
  padding: 12px;
  font-size: calc(14px * var(--font-scale, 1));
}
.auth__captcha {
  background: var(--bg-2);
  border: 1px solid var(--border);
  padding: 12px;
  border-radius: 12px;
}
.auth__captcha-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}
.auth__captcha-img {
  max-height: 48px;
  border-radius: 6px;
  background: white;
}
.auth__captcha-input {
  flex: 1;
  min-width: 0;
}
.auth__error {
  margin: 0;
  color: var(--danger);
  font-size: calc(13px * var(--font-scale, 1));
  background: rgba(239, 68, 68, 0.1);
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid rgba(239, 68, 68, 0.2);
}
.auth__back {
  text-align: center;
  margin-top: 10px;
}
.auth__back a {
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
  text-decoration: none;
  transition: color var(--motion-duration-fast);
}
.auth__back a:hover {
  color: var(--text-0);
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
</style>
