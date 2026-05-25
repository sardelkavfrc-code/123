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
    } catch (err) {
      status.value = emptyStatus();
      if (err instanceof APIError && err.status !== 401) {
        lastError.value = err.message;
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
    }
  }

  async function loginWithToken(payload: TokenLoginPayload) {
    lastError.value = null;
    loading.value = true;
    try {
      status.value = await api.loginWithToken({ remember: true, ...payload });
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
    logout,
  };
});
