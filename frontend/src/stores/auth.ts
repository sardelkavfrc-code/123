import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, APIError } from "@/api/client";
import type { AuthStatus } from "@/api/types";

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

  async function loginViaOAuth() {
    lastError.value = null;
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
      // Backend will run the Kate Mobile receipt refresh on this token
      // before saving it, so the persisted session has audio access.
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
    isAuthenticated,
    hasAudio,
    displayName,
    refresh,
    loginViaOAuth,
    logout,
  };
});
