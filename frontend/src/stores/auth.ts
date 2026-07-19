import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, APIError } from "@/api/client";
import type { AuthStatus } from "@/api/types";

export interface TokenLoginPayload {
  access_token: string;
  user_id?: number;
  remember?: boolean;
}

const emptyStatus = (): AuthStatus => ({
  authenticated: false,
  user_id: null,
  first_name: null,
  last_name: null,
  photo: null,
  has_audio: false,
});

export const useAuthStore = defineStore("auth", () => {
  const status = ref<AuthStatus>(emptyStatus());
  const checked = ref(false);
  const loading = ref(false);
  const lastError = ref<string | null>(null);

  const isAuthenticated = computed(() => status.value.authenticated);
  const hasAudio = computed(() => status.value.has_audio);
  const displayName = computed(() => {
    const parts = [status.value.first_name, status.value.last_name].filter(Boolean);
    return parts.join(" ") || "Профиль";
  });

  async function refresh() {
    try {
      status.value = await api.authStatus();
      if (status.value.authenticated) {
        localStorage.setItem("wasAuthenticated", "true");
      } else {
        localStorage.removeItem("wasAuthenticated");
      }
    } catch (err) {
      if (err instanceof APIError && err.status === 401) {
        if (window.vkmp?.openVKAuth && localStorage.getItem("wasAuthenticated") === "true") {
          try {
            const result = await window.vkmp.openVKAuth(true);
            if (result.ok) {
              const loginOk = await loginWithToken({
                access_token: result.access_token,
                user_id: result.user_id,
                remember: true,
              });
              if (loginOk) {
                checked.value = true;
                return;
              }
            }
          } catch (e) {
            console.error("Silent auth retry failed", e);
          }
        }
        status.value = emptyStatus();
        localStorage.removeItem("wasAuthenticated");
      } else {
        // Not a 401 (e.g. 504 Gateway Timeout or network down).
        if (localStorage.getItem("wasAuthenticated") === "true") {
          // Assume still authenticated to prevent redirect loop to login screen
          status.value.authenticated = true;
          if (err instanceof APIError) {
            lastError.value = "Ошибка связи с ВК: " + err.message;
          } else {
            lastError.value = "Ошибка сети: " + (err as Error).message;
          }
        } else {
          status.value = emptyStatus();
          if (err instanceof APIError) {
            lastError.value = err.message;
          }
        }
      }
    } finally {
      checked.value = true;
    }
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      status.value = emptyStatus();
      localStorage.removeItem("wasAuthenticated");
    }
  }

  async function loginWithToken(payload: TokenLoginPayload) {
    lastError.value = null;
    loading.value = true;
    try {
      status.value = await api.loginWithToken({ remember: true, ...payload });
      localStorage.setItem("wasAuthenticated", "true");
      return true;
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
      } else {
        lastError.value = (err as Error).message;
      }
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function loginViaOAuth() {
    if (!window.vkmp?.openVKAuth) {
      lastError.value = "OAuth-вход доступен только в десктоп-сборке";
      return false;
    }
    lastError.value = null;
    loading.value = true;
    try {
      const result = await window.vkmp.openVKAuth();
      if (!result.ok) {
        lastError.value = result.error;
        return false;
      }
      return await loginWithToken({
        access_token: result.access_token,
        user_id: result.user_id,
        remember: true,
      });
    } finally {
      loading.value = false;
    }
  }

  async function validateAccount(payload: {
    login: string;
    captcha_sid?: string;
    captcha_key?: string;
    success_token?: string;
  }) {
    lastError.value = null;
    loading.value = true;
    try {
      return await api.validateAccount(payload);
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
        throw err;
      } else {
        lastError.value = (err as Error).message;
        throw err;
      }
    } finally {
      loading.value = false;
    }
  }

  async function getVerificationMethods(payload: { sid: string; login?: string }) {
    lastError.value = null;
    loading.value = true;
    try {
      return await api.getVerificationMethods(payload);
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
      } else {
        lastError.value = (err as Error).message;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function sendOtpSms(payload: { sid: string; login?: string }) {
    lastError.value = null;
    loading.value = true;
    try {
      return await api.sendOtpSms(payload);
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
      } else {
        lastError.value = (err as Error).message;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function sendCallreset(payload: { sid: string; login?: string }) {
    lastError.value = null;
    loading.value = true;
    try {
      return await api.sendCallreset(payload);
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
      } else {
        lastError.value = (err as Error).message;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function sendEmail(payload: { sid: string; login?: string }) {
    lastError.value = null;
    loading.value = true;
    try {
      return await api.sendEmail(payload);
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
      } else {
        lastError.value = (err as Error).message;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function sendOtpPush(payload: { sid: string; login?: string }) {
    lastError.value = null;
    loading.value = true;
    try {
      return await api.sendOtpPush(payload);
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
      } else {
        lastError.value = (err as Error).message;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function sendOtpMax(payload: { sid: string; login?: string }) {
    lastError.value = null;
    loading.value = true;
    try {
      return await api.sendOtpMax(payload);
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
      } else {
        lastError.value = (err as Error).message;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function checkOtp(payload: {
    sid: string;
    code: string;
    verification_method: string;
    login?: string;
  }) {
    lastError.value = null;
    loading.value = true;
    try {
      return await api.checkOtp(payload);
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
      } else {
        lastError.value = (err as Error).message;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  async function confirmAuth(payload: {
    grant_type: string;
    username: string;
    code?: string;
    password?: string;
    remember?: boolean;
    sid?: string;
    captcha_sid?: string;
    captcha_key?: string;
  }) {
    lastError.value = null;
    loading.value = true;
    try {
      status.value = await api.confirmAuth(payload);
      localStorage.setItem("wasAuthenticated", "true");
      return true;
    } catch (err) {
      if (err instanceof APIError) {
        lastError.value = err.detail.message || err.message;
      } else {
        lastError.value = (err as Error).message;
      }
      throw err;
    } finally {
      loading.value = false;
    }
  }

  return {
    status,
    checked,
    loading,
    lastError,
    isAuthenticated,
    hasAudio,
    displayName,
    refresh,
    loginWithToken,
    loginViaOAuth,
    validateAccount,
    getVerificationMethods,
    sendOtpSms,
    sendCallreset,
    sendEmail,
    sendOtpPush,
    sendOtpMax,
    checkOtp,
    confirmAuth,
    logout,
  };
});
