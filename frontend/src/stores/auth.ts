import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, APIError } from "@/api/client";
import type { AuthChallenge, AuthStatus } from "@/api/types";

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
  const challenge = ref<AuthChallenge | null>(null);

  const isAuthenticated = computed(() => status.value.authenticated);
  const hasAudio = computed(() => status.value.has_audio);
  const displayName = computed(() => {
    const parts = [status.value.first_name, status.value.last_name].filter(Boolean);
    return parts.join(" ") || "Профиль";
  });

  async function refresh() {
    try {
      status.value = await api.authStatus();
    } catch (err) {
      status.value = emptyStatus();
      if (err instanceof APIError && err.status !== 401) {
        lastError.value = err.message;
      }
    } finally {
      checked.value = true;
    }
  }

  async function login(payload: {
    username: string;
    password: string;
    code?: string;
    captcha_sid?: string;
    captcha_key?: string;
    remember?: boolean;
  }) {
    loading.value = true;
    lastError.value = null;
    challenge.value = null;
    try {
      status.value = await api.login(payload);
      return true;
    } catch (err) {
      if (err instanceof APIError && err.status === 401) {
        const detail = err.detail;
        if (detail.kind === "need_validation" || detail.kind === "need_captcha") {
          challenge.value = {
            kind: detail.kind,
            message: detail.message ?? "",
            validation_sid: detail.validation_sid ?? null,
            captcha_sid: detail.captcha_sid ?? null,
            captcha_img: detail.captcha_img ?? null,
            phone_mask: detail.phone_mask ?? null,
          };
          return false;
        }
      }
      lastError.value =
        err instanceof APIError ? err.detail.message || err.message : (err as Error).message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function loginWithToken(payload: { access_token: string; remember: boolean }) {
    loading.value = true;
    lastError.value = null;
    try {
      status.value = await api.loginWithToken(payload);
      return true;
    } catch (err) {
      lastError.value =
        err instanceof APIError ? err.detail.message || err.message : (err as Error).message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function logout() {
    try {
      await api.logout();
    } finally {
      status.value = emptyStatus();
      challenge.value = null;
    }
  }

  async function loginViaOAuth() {
    lastError.value = null;
    challenge.value = null;
    if (!window.vkmp?.openVKAuth) {
      lastError.value = "VK вход доступен только в десктоп-версии (Electron).";
      return false;
    }
    loading.value = true;
    try {
      const result = await window.vkmp.openVKAuth();
      if (!result.ok) {
        if (result.reason !== "cancelled") {
          lastError.value = result.message || "Не удалось получить токен ВК";
        }
        return false;
      }
      status.value = await api.loginWithToken({
        access_token: result.access_token,
        remember: true,
      });
      return true;
    } catch (err) {
      lastError.value =
        err instanceof APIError ? err.detail.message || err.message : (err as Error).message;
      return false;
    } finally {
      loading.value = false;
    }
  }

  return {
    status,
    checked,
    loading,
    lastError,
    challenge,
    isAuthenticated,
    hasAudio,
    displayName,
    refresh,
    login,
    loginWithToken,
    loginViaOAuth,
    logout,
  };
});
