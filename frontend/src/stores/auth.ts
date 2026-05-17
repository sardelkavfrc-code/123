import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, APIError } from "@/api/client";
import type { AuthChallenge, AuthStatus } from "@/api/types";

export const useAuthStore = defineStore("auth", () => {
  const status = ref<AuthStatus>({
    authenticated: false,
    user_id: null,
    first_name: null,
    last_name: null,
    photo: null,
  });
  const checked = ref(false);
  const loading = ref(false);
  const challenge = ref<AuthChallenge | null>(null);
  const lastError = ref<string | null>(null);

  const isAuthenticated = computed(() => status.value.authenticated);
  const displayName = computed(() => {
    const parts = [status.value.first_name, status.value.last_name].filter(Boolean);
    return parts.join(" ") || "Профиль";
  });

  async function refresh() {
    try {
      status.value = await api.authStatus();
    } catch (err) {
      status.value = {
        authenticated: false,
        user_id: null,
        first_name: null,
        last_name: null,
        photo: null,
      };
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
  }) {
    loading.value = true;
    challenge.value = null;
    lastError.value = null;
    try {
      status.value = await api.login(payload);
      return true;
    } catch (err) {
      if (err instanceof APIError && err.status === 401 && err.detail.kind) {
        if (
          err.detail.kind === "need_validation" ||
          err.detail.kind === "need_captcha"
        ) {
          challenge.value = err.detail as AuthChallenge;
        } else {
          lastError.value = err.detail.message || "Ошибка входа";
        }
      } else {
        lastError.value = (err as Error).message || "Ошибка сети";
      }
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
      status.value = {
        authenticated: false,
        user_id: null,
        first_name: null,
        last_name: null,
        photo: null,
      };
    }
  }

  return {
    status,
    checked,
    loading,
    challenge,
    lastError,
    isAuthenticated,
    displayName,
    refresh,
    login,
    loginWithToken,
    logout,
  };
});
