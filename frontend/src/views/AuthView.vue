<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useAuthStore } from "@/stores/auth";
import { useMotion } from "@/composables/useSpring";
import Spinner from "@/components/Spinner.vue";
import { APIError } from "@/api/client";

import type { VerificationMethod } from "@/api/types";

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const motion = useMotion();

const { loading, lastError } = storeToRefs(auth);

// Flow State
type AuthStep = "login" | "callreset" | "sms" | "password" | "email" | "push" | "max_messenger" | "codegen" | "2fa" | "select_method";
const step = ref<AuthStep>("login");
const availableMethods = ref<VerificationMethod[]>([]);

const resendTimer = ref(0);
let timerInterval: number | null = null;

function startTimer(seconds: number) {
  if (timerInterval) clearInterval(timerInterval);
  resendTimer.value = seconds;
  if (seconds > 0) {
    timerInterval = window.setInterval(() => {
      if (resendTimer.value > 0) {
        resendTimer.value--;
      } else {
        if (timerInterval) clearInterval(timerInterval);
      }
    }, 1000);
  }
}

function processTimer(res: any) {
  const delay = res?.response?.delay || res?.delay || res?.polling_delay || 60;
  startTimer(delay);
}

const loginInput = ref("");
const codeInput = ref("");
const passwordInput = ref("");

// Verification Session State
const sid = ref("");
const hasAnotherWays = ref(false);

// 2FA Validation State
const validationSid = ref("");
const validationType = ref("");
const phoneMask = ref("");
const maskedEmail = ref("");

// Captcha State
const captchaSid = ref<string | null>(null);
const captchaImg = ref<string | null>(null);
const captchaKey = ref("");

// Webview Validation State
const showWebview = ref(false);
const validationUrl = ref("");
const isWebviewReady = ref(false);
let validationResolve: ((token: string | null) => void) | null = null;

function handleWebviewDomReady(event: any) {
  const webview = event.target;
  const script = `
    (function() {
      if (!window.__fetchIntercepted) {
        window.__fetchIntercepted = true;
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          const url = args[0] ? String(args[0]) : "";
          return originalFetch.apply(this, args).then(response => {
            response.clone().json().then(data => {
              const token = data?.response?.success_token || data?.success_token;
              if (token) {
                console.log("SUCCESS_TOKEN_INTERCEPTED:" + token);
              }
              if (url.includes("leaveCaptcha") || url.includes("endSession")) {
                console.log("VALIDATION_FINISHED");
              }
            }).catch(() => {});
            return response;
          });
        };
      }

      function injectStyle() {
        let style = document.getElementById('vkmp-transparent-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'vkmp-transparent-style';
          style.innerHTML = \`
            html, body, #page_wrap, .page_wrap, #box_wrap, .box_wrap,
            .vkc__page__wrap, .vkc__auth__page, [class*="Page__background"], 
            [class*="Page__wrap"], [class*="Auth__background"],
            .login_mobile_header, .vk__header, header, footer,
            #vk_wrap, #wrap, #container, .layout, .main {
              background: transparent !important;
              background-color: transparent !important;
              border: none !important;
              box-shadow: none !important;
            }
            html, body {
              display: flex !important;
              align-items: flex-end !important;
              justify-content: center !important;
              height: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            div[class*="Card__"], div[class*="card"], .vkc__auth__card, .box_body, [class*="Card__container"] {
              background: #18191d !important;
              background-color: #18191d !important;
              color: #ffffff !important;
              border: 1px solid rgba(255, 255, 255, 0.08) !important;
              box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5) !important;
              border-radius: 20px !important;
              margin-bottom: 24px !important;
            }
            span, h1, h2, h3, h4, p, label, a {
              color: #e1e3e6 !important;
            }
            .vkc__not_robot__title, .vkc__not_robot__subtitle, [class*="title"], [class*="subtitle"], [class*="text"] {
              color: #ffffff !important;
            }
          \`;
          document.head.appendChild(style);
        }
      }

      function clean() {
        injectStyle();
        const divs = document.querySelectorAll('div');
        let card = null;
        for (const el of divs) {
          const style = window.getComputedStyle(el);
          const r = parseInt(style.borderRadius) || 0;
          if (r > 8 && el.offsetWidth > 200 && el.offsetHeight > 200) {
            card = el;
            break;
          }
        }
        if (card) {
          let p = card.parentElement;
          while (p) {
            p.style.setProperty('background', 'transparent', 'important');
            p.style.setProperty('background-color', 'transparent', 'important');
            p = p.parentElement;
          }
          document.body.style.setProperty('background', 'transparent', 'important');
          document.body.style.setProperty('background-color', 'transparent', 'important');
          document.documentElement.style.setProperty('background', 'transparent', 'important');
          document.documentElement.style.setProperty('background-color', 'transparent', 'important');
        }
      }
      clean();
      setInterval(clean, 150);
    })();
  `;
  webview.executeJavaScript(script).catch(() => {});

  const darkCss = `
    ::-webkit-scrollbar {
      width: 6px !important;
      height: 6px !important;
    }
    ::-webkit-scrollbar-track {
      background: transparent !important;
    }
    ::-webkit-scrollbar-thumb {
      background: rgba(255, 255, 255, 0.15) !important;
      border-radius: 3px !important;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255, 255, 255, 0.25) !important;
    }
  `;
  webview.insertCSS(darkCss).catch(() => {});

  setTimeout(() => {
    isWebviewReady.value = true;
  }, 300);
}

function handleWebviewConsoleMessage(event: any) {
  const message = event.message || "";
  if (message.startsWith("SUCCESS_TOKEN_INTERCEPTED:")) {
    const token = message.substring("SUCCESS_TOKEN_INTERCEPTED:".length);
    if (validationResolve) {
      validationResolve(token);
    }
    closeWebview();
  } else if (message.startsWith("VALIDATION_FINISHED")) {
    if (validationResolve) {
      validationResolve(null);
    }
    closeWebview();
  }
}

function closeWebview() {
  showWebview.value = false;
  validationUrl.value = "";
  isWebviewReady.value = false;
  if (validationResolve) {
    validationResolve(null);
    validationResolve = null;
  }
}

function startValidationInApp(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    validationUrl.value = url;
    showWebview.value = true;
    validationResolve = resolve;
  });
}

const cardVariants = computed(() =>
  motion.spring(
    { opacity: 0, y: 32, scale: 0.96 },
    { opacity: 1, y: 0, scale: 1 },
    { stiffness: 180, damping: 20 },
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
  validationSid.value = "";
  validationType.value = "";
  phoneMask.value = "";
  maskedEmail.value = "";
  closeWebview();
}

async function handleValidationResponse(res: any) {
  if (res && res.sid) {
    sid.value = res.sid;
    hasAnotherWays.value = res.next_step?.has_another_verification_methods || false;
    
    const method = res.next_step?.verification_method;
    if (method === "callreset") {
      try {
        const sendRes = await auth.sendCallreset({ sid: res.sid, login: loginInput.value });
        processTimer(sendRes);
        if (sendRes && sendRes.verification_method) {
          step.value = sendRes.verification_method as any;
        } else {
          step.value = "callreset";
        }
      } catch (err) {
        step.value = "callreset";
      }
    } else if (method === "sms") {
      try {
        const sendRes = await auth.sendOtpSms({ sid: res.sid, login: loginInput.value });
        processTimer(sendRes);
      } catch (err) {
        // ignore
      }
      step.value = "sms";
    } else if (method === "email") {
      try {
        const sendRes = await auth.sendEmail({ sid: res.sid, login: loginInput.value });
        processTimer(sendRes);
      } catch (err) {
        // ignore
      }
      step.value = "email";
    } else if (method === "push") {
      try {
        const sendRes = await auth.sendOtpPush({ sid: res.sid, login: loginInput.value });
        processTimer(sendRes);
      } catch (err) {
        // ignore
      }
      step.value = "push";
    } else if (method === "max_messenger") {
      try {
        const sendRes = await auth.sendOtpMax({ sid: res.sid, login: loginInput.value });
        processTimer(sendRes);
      } catch (err) {
        // ignore
      }
      step.value = "max_messenger";
    } else if (method === "codegen") {
      step.value = "codegen";
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
    // Clear captcha
    captchaSid.value = null;
    captchaImg.value = null;
    captchaKey.value = "";
    await handleValidationResponse(res);
  } catch (err) {
    if (err instanceof APIError) {
      if (err.detail?.redirect_uri) {
        lastError.value = null;
        try {
          const successToken = await startValidationInApp(err.detail.redirect_uri);
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
    await auth.sendOtpSms({ sid: sid.value, login: loginInput.value });
    step.value = "sms";
    codeInput.value = "";
  } catch (err) {
    // Error is handled by Pinia store
  }
}

async function requestAnotherMethods() {
  if (loading.value || !sid.value) return;
  try {
    const res = await auth.getVerificationMethods({ sid: sid.value, login: loginInput.value });
    if (res && res.methods) {
      availableMethods.value = res.methods;
      step.value = "select_method";
    }
  } catch (err) {
    // Error is handled by Pinia store
  }
}

async function selectMethod(methodName: string) {
  if (loading.value || !sid.value) return;
  try {
    if (methodName === "sms") {
      const r = await auth.sendOtpSms({ sid: sid.value, login: loginInput.value });
      processTimer(r);
      step.value = "sms";
      codeInput.value = "";
    } else if (methodName === "email") {
      const r = await auth.sendEmail({ sid: sid.value, login: loginInput.value });
      processTimer(r);
      step.value = "email";
      codeInput.value = "";
    } else if (methodName === "callreset") {
      const r = await auth.sendCallreset({ sid: sid.value, login: loginInput.value });
      processTimer(r);
      step.value = "callreset";
      codeInput.value = "";
    } else if (methodName === "push") {
      const r = await auth.sendOtpPush({ sid: sid.value, login: loginInput.value });
      processTimer(r);
      step.value = "push";
      codeInput.value = "";
    } else if (methodName === "max_messenger") {
      const r = await auth.sendOtpMax({ sid: sid.value, login: loginInput.value });
      processTimer(r);
      step.value = "max_messenger";
      codeInput.value = "";
    } else if (methodName === "password") {
      step.value = "password";
    } else if (methodName === "codegen") {
      step.value = "codegen";
    }
  } catch (err) {
    // Error is handled by Pinia store
  }
}

// Step 3: Check OTP Code
async function handleCodeSubmit() {
  if (loading.value || !sid.value) return;
  lastError.value = null;

  const verificationMethod = 
    step.value === "callreset" ? "callreset" :
    step.value === "email" ? "email" :
    step.value === "sms" ? "sms" :
    step.value === "push" ? "push" :
    step.value === "max_messenger" ? "max_messenger" :
    step.value === "codegen" ? "codegen" : "sms";

  try {
    const res = await auth.checkOtp({
      sid: sid.value,
      code: codeInput.value,
      verification_method: verificationMethod,
      login: loginInput.value,
    });

    if (res) {
      if (res.can_skip_password !== false) {
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
      } else {
        // We cannot skip password! Transition to password step.
        step.value = "password";
      }
    }
  } catch (err) {
    // Handled by Pinia store
  }
}

// Step 4: Submit password (for Scenario В / 2FA check)
async function handlePasswordSubmit() {
  if (loading.value) return;
  lastError.value = null;

  try {
    const ok = await auth.confirmAuth({
      grant_type: "password",
      username: loginInput.value,
      password: passwordInput.value,
      sid: sid.value || undefined,
      remember: true,
      captcha_sid: captchaSid.value || undefined,
      captcha_key: captchaKey.value || undefined,
    });

    if (ok) {
      router.replace(redirectTarget());
    }
  } catch (err) {
    if (err instanceof APIError) {
      if (err.detail?.error === "need_validation") {
        // Two-factor authentication required!
        validationSid.value = err.detail.validation_sid || "";
        validationType.value = err.detail.validation_type || "";
        phoneMask.value = err.detail.phone_mask || "";
        maskedEmail.value = err.detail.masked_email || "";
        
        // Reset captcha
        captchaSid.value = null;
        captchaImg.value = null;
        captchaKey.value = "";
        
        // Transition to 2FA step
        step.value = "2fa";
        codeInput.value = "";
      } else if (err.detail?.error === "need_captcha") {
        captchaSid.value = err.detail.captcha_sid || null;
        captchaImg.value = err.detail.captcha_img || null;
        captchaKey.value = "";
      }
    }
  }
}

// Step 5: Submit 2FA Code (MFA)
async function handle2faSubmit() {
  if (loading.value || !validationSid.value) return;
  lastError.value = null;

  try {
    const ok = await auth.confirmAuth({
      grant_type: "password",
      username: loginInput.value,
      password: passwordInput.value,
      code: codeInput.value,
      sid: validationSid.value,
      remember: true,
      captcha_sid: captchaSid.value || undefined,
      captcha_key: captchaKey.value || undefined,
    });

    if (ok) {
      router.replace(redirectTarget());
    }
  } catch (err) {
    if (err instanceof APIError) {
      if (err.detail?.error === "need_captcha") {
        captchaSid.value = err.detail.captcha_sid || null;
        captchaImg.value = err.detail.captcha_img || null;
        captchaKey.value = "";
      }
    }
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
            Авторизация через Android-клиент
          </p>
        </div>
      </div>

      <!-- Step 1: Login Input (Phone/Email) + Captcha -->
      <form v-if="step === 'login'" @submit.prevent="handleLoginSubmit" class="auth__form">
        <p class="auth__instructions">
          Введите телефон или адрес электронной почты аккаунта ВКонтакте:
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
          <span>{{ loading ? "Проверка аккаунта..." : "Продолжить" }}</span>
        </button>
      </form>

      <!-- Scenario A: Call Reset / Fallback OTP -->
      <form v-else-if="step === 'callreset'" @submit.prevent="handleCodeSubmit" class="auth__form">
        <p class="auth__instructions">
          Введите 6 последних цифр входящего номера звонка-сброса, код из SMS или письма:
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
            :disabled="loading || resendTimer > 0"
            @click="requestAnotherMethods"
          >
            {{ resendTimer > 0 ? `Запросить повторно через ${resendTimer}` : "Выбрать другой способ" }}
          </button>
        </div>
      </form>

      <!-- Scenario B: SMS Code -->
      <form v-else-if="step === 'sms'" @submit.prevent="handleCodeSubmit" class="auth__form">
        <p class="auth__instructions">
          Введите код подтверждения из SMS:
        </p>

        <div class="form-group">
          <input
            v-model="codeInput"
            type="text"
            class="input auth__input auth__input--code"
            placeholder="000000"
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
            v-if="hasAnotherWays"
            type="button"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading || resendTimer > 0"
            @click="requestAnotherMethods"
          >
            {{ resendTimer > 0 ? `Запросить повторно через ${resendTimer}` : "Выбрать другой способ" }}
          </button>
        </div>
      </form>

      <!-- Scenario Г: Email Code -->
      <form v-else-if="step === 'email'" @submit.prevent="handleCodeSubmit" class="auth__form">
        <p class="auth__instructions">
          Введите код подтверждения, отправленный на вашу почту:
        </p>

        <div class="form-group">
          <input
            v-model="codeInput"
            type="text"
            class="input auth__input auth__input--code"
            placeholder="000000"
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
            v-if="hasAnotherWays"
            type="button"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading || resendTimer > 0"
            @click="requestAnotherMethods"
          >
            {{ resendTimer > 0 ? `Запросить повторно через ${resendTimer}` : "Выбрать другой способ" }}
          </button>
        </div>
      </form>

      <!-- Scenario Push Code -->
      <form v-else-if="step === 'push'" @submit.prevent="handleCodeSubmit" class="auth__form">
        <p class="auth__instructions">
          Введите код подтверждения из PUSH-уведомления:
        </p>

        <div class="form-group">
          <input
            v-model="codeInput"
            type="text"
            class="input auth__input auth__input--code"
            placeholder="000000"
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
            v-if="hasAnotherWays"
            type="button"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading || resendTimer > 0"
            @click="requestAnotherMethods"
          >
            {{ resendTimer > 0 ? `Запросить повторно через ${resendTimer}` : "Выбрать другой способ" }}
          </button>
        </div>
      </form>

      <!-- Scenario Max Messenger Code -->
      <form v-else-if="step === 'max_messenger'" @submit.prevent="handleCodeSubmit" class="auth__form">
        <p class="auth__instructions">
          Введите код подтверждения из сообщений ВКонтакте:
        </p>

        <div class="form-group">
          <input
            v-model="codeInput"
            type="text"
            class="input auth__input auth__input--code"
            placeholder="000000"
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
            v-if="hasAnotherWays"
            type="button"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading || resendTimer > 0"
            @click="requestAnotherMethods"
          >
            {{ resendTimer > 0 ? `Запросить повторно через ${resendTimer}` : "Выбрать другой способ" }}
          </button>
        </div>
      </form>

      <!-- Scenario Codegen Code -->
      <form v-else-if="step === 'codegen'" @submit.prevent="handleCodeSubmit" class="auth__form">
        <p class="auth__instructions">
          Введите код подтверждения из приложения-генератора (Google Authenticator):
        </p>

        <div class="form-group">
          <input
            v-model="codeInput"
            type="text"
            class="input auth__input auth__input--code"
            placeholder="000000"
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
            v-if="hasAnotherWays"
            type="button"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading || resendTimer > 0"
            @click="requestAnotherMethods"
          >
            {{ resendTimer > 0 ? `Запросить повторно через ${resendTimer}` : "Выбрать другой способ" }}
          </button>
        </div>
      </form>

      <!-- Scenario В: Password -->
      <form v-else-if="step === 'password'" @submit.prevent="handlePasswordSubmit" class="auth__form">
        <p class="auth__instructions">
          Введите ваш текущий пароль ВКонтакте:
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

        <button class="btn btn--primary auth__submit" type="submit" :disabled="loading || !passwordInput">
          <Spinner v-if="loading" :size="18" />
          <span>{{ loading ? "Проверка..." : "Войти" }}</span>
        </button>

        <button
          v-if="hasAnotherWays"
          type="button"
          class="btn btn--secondary auth__secondary-btn"
          style="margin-top: 12px;"
          :disabled="loading || resendTimer > 0"
          @click="requestAnotherMethods"
        >
          {{ resendTimer > 0 ? `Запросить повторно через ${resendTimer}` : "Выбрать другой способ" }}
        </button>
      </form>

      <!-- Scenario Select Method -->
      <div v-else-if="step === 'select_method'" class="auth__form">
        <p class="auth__instructions">
          Выберите доступный способ подтверждения:
        </p>

        <div class="auth__actions auth__actions--methods">
          <button
            v-for="method in availableMethods"
            :key="method.name"
            class="btn btn--secondary auth__secondary-btn"
            :disabled="loading"
            @click="selectMethod(method.name)"
            style="margin-bottom: 8px; text-align: left; padding: 12px; height: auto;"
          >
            <strong v-if="method.name === 'sms'">Отправить SMS</strong>
            <strong v-else-if="method.name === 'email'">Отправить письмо</strong>
            <strong v-else-if="method.name === 'callreset'">Звонок-сброс</strong>
            <strong v-else-if="method.name === 'push'">Push-уведомление</strong>
            <strong v-else-if="method.name === 'max_messenger'">Сообщение ВКонтакте</strong>
            <strong v-else-if="method.name === 'password'">Ввести пароль</strong>
            <strong v-else-if="method.name === 'codegen'">Генератор кодов</strong>
            <strong v-else>{{ method.name }}</strong>

            <span v-if="method.info" style="display: block; font-size: 13px; opacity: 0.7; font-weight: normal; margin-top: 4px;">
              {{ method.info }}
            </span>
          </button>
        </div>
      </div>

      <!-- Scenario 2FA Code (MFA) -->
      <form v-else-if="step === '2fa'" @submit.prevent="handle2faSubmit" class="auth__form">
        <p class="auth__instructions">
          <span v-if="validationType === '2fa_sms'">
            Введите код подтверждения из SMS, отправленного на номер {{ phoneMask }}:
          </span>
          <span v-else-if="validationType === '2fa_push'">
            Введите код подтверждения из PUSH-уведомления:
          </span>
          <span v-else-if="validationType === '2fa_email'">
            Введите код подтверждения из письма, отправленного на {{ maskedEmail }}:
          </span>
          <span v-else>
            Введите двухфакторный код подтверждения (2FA):
          </span>
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

        <button class="btn btn--primary auth__submit" type="submit" :disabled="loading || !codeInput">
          <Spinner v-if="loading" :size="18" />
          <span>{{ loading ? "Подтверждение..." : "Войти" }}</span>
        </button>
      </form>

      <!-- Error Display -->
      <p v-if="lastError" class="auth__error">{{ lastError }}</p>

      <!-- Back Link -->
      <div v-if="step !== 'login'" class="auth__back">
        <a href="#" @click.prevent="resetFlow">← Назад к вводу логина</a>
      </div>
    </div>

    <!-- In-App Validation Webview Bottom Sheet Modal -->
    <Transition name="fade-slide">
      <div v-if="showWebview" class="auth__webview-modal" @click.self="closeWebview">
        <div class="auth__webview-container">
          <webview
            class="auth__webview-frame"
            :class="{ 'auth__webview-frame--ready': isWebviewReady }"
            :src="validationUrl"
            @dom-ready="handleWebviewDomReady"
            @console-message="handleWebviewConsoleMessage"
          />
        </div>
      </div>
    </Transition>
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
    radial-gradient(900px 540px at 20% 10%, color-mix(in srgb, var(--accent-1) 18%, transparent), transparent 60%),
    radial-gradient(700px 540px at 80% 100%, color-mix(in srgb, var(--accent-3) 14%, transparent), transparent 60%);
}
.auth__card {
  width: 100%;
  max-width: 440px;
  padding: 36px 32px 30px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  background: rgba(255, 255, 255, 0.02);
  backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 24px;
  box-shadow: 0 16px 48px 0 rgba(0, 0, 0, 0.45);
}
.auth__brand {
  display: flex;
  align-items: center;
  gap: 16px;
}
.auth__logo {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background-image: linear-gradient(135deg, var(--accent-1) 0%, var(--accent-3) 100%);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}
.auth__title {
  margin: 0;
  font-size: calc(22px * var(--font-scale, 1));
  font-weight: 800;
  letter-spacing: -0.5px;
}
.auth__subtitle {
  margin: 2px 0 0;
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
  opacity: 0.85;
}
.auth__form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.auth__instructions {
  margin: 0;
  color: var(--text-1);
  font-size: calc(14px * var(--font-scale, 1));
  line-height: 1.55;
  opacity: 0.95;
}
.auth__instructions--captcha {
  font-size: calc(13px * var(--font-scale, 1));
  margin-bottom: 6px;
  color: var(--text-0);
  opacity: 1;
}
.auth__input {
  width: 100%;
  font-size: calc(15px * var(--font-scale, 1));
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: var(--text-0);
  transition: all var(--motion-duration-fast);
}
.auth__input:focus {
  background: rgba(255, 255, 255, 0.07);
  border-color: var(--accent-1);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-1) 20%, transparent);
}
.auth__input--code {
  letter-spacing: 6px;
  text-align: center;
  font-size: calc(22px * var(--font-scale, 1));
  font-weight: 800;
  padding: 12px 14px;
}
.auth__submit {
  width: 100%;
  font-size: calc(15px * var(--font-scale, 1));
  font-weight: 600;
  padding: 14px 20px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all var(--motion-duration-fast);
}
.auth__actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.auth__secondary-btn {
  width: 100%;
  padding: 12px 18px;
  font-size: calc(14px * var(--font-scale, 1));
  font-weight: 500;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: all var(--motion-duration-fast);
}
.auth__secondary-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.12);
}
.auth__captcha {
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: 14px;
  border-radius: 16px;
}
.auth__captcha-wrapper {
  display: flex;
  align-items: center;
  gap: 14px;
}
.auth__captcha-img {
  max-height: 48px;
  border-radius: 8px;
  background: white;
  padding: 2px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
.auth__captcha-input {
  flex: 1;
  min-width: 0;
}
.auth__error {
  margin: 0;
  color: #ff5a5a;
  font-size: calc(13px * var(--font-scale, 1));
  background: rgba(255, 90, 90, 0.08);
  padding: 12px 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 90, 90, 0.15);
  line-height: 1.45;
}
.auth__back {
  text-align: center;
  margin-top: 4px;
}
.auth__back a {
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 500;
  text-decoration: none;
  transition: color var(--motion-duration-fast);
  opacity: 0.85;
}
.auth__back a:hover {
  color: var(--text-0);
  opacity: 1;
}
.auth__pitch {
  margin: 0;
  text-align: center;
  font-size: calc(12px * var(--font-scale, 1));
  line-height: 1.5;
}
.auth__pitch--muted {
  color: var(--text-3);
  opacity: 0.75;
}

.auth__webview-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px);
  z-index: 1000;
  display: flex;
  justify-content: center;
  align-items: flex-end;
}
.auth__webview-container {
  width: 100%;
  max-width: 480px;
  height: 400px;
  background: transparent !important;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: none !important;
  border: none !important;
}
.auth__webview-frame {
  flex: 1;
  width: 100%;
  height: 100%;
  background: transparent !important;
  opacity: 0;
  transition: opacity 0.3s ease;
}
.auth__webview-frame--ready {
  opacity: 1 !important;
}

/* Transition Animations */
.fade-slide-enter-active {
  transition: opacity 0.5s ease, backdrop-filter 0.5s ease;
}
.fade-slide-enter-active .auth__webview-container {
  transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.15s;
}

.fade-slide-leave-active {
  transition: opacity 0.3s ease 0.15s, backdrop-filter 0.3s ease 0.15s;
}
.fade-slide-leave-active .auth__webview-container {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  backdrop-filter: blur(0px);
  background-color: rgba(0, 0, 0, 0);
}
.fade-slide-enter-from .auth__webview-container,
.fade-slide-leave-to .auth__webview-container {
  transform: translateY(100%);
}
</style>
