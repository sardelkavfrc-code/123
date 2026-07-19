<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useUIStore } from "@/stores/ui";
import SvgIcon from "./SvgIcon.vue";

const ui = useUIStore();
const captchaKey = ref("");
const inputRef = ref<HTMLInputElement | null>(null);

watch(() => ui.captchaImg, (newVal) => {
  if (newVal) {
    captchaKey.value = "";
    nextTick(() => {
      inputRef.value?.focus();
    });
  }
});

function submit() {
  if (captchaKey.value.trim()) {
    ui.resolveCaptcha(captchaKey.value.trim());
  }
}

function cancel() {
  ui.cancelCaptcha();
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="ui.captchaImg" class="captcha-overlay" @click.self="cancel">
      <div class="captcha-modal" @click.stop>
        <div class="captcha-modal__header">
          <div class="captcha-modal__title-group">
            <SvgIcon name="library" width="20" height="20" />
            <h2>Требуется проверка</h2>
          </div>
          <button class="captcha-modal__close-btn" @click="cancel" aria-label="Закрыть">
            <SvgIcon name="cross" width="18" height="18" />
          </button>
        </div>

        <div class="captcha-modal__body">
          <p class="captcha-modal__desc">
            ВКонтакте просит ввести код с картинки, чтобы продолжить действие.
          </p>

          <div class="captcha-modal__img-wrapper">
            <img :src="ui.captchaImg" alt="Captcha" class="captcha-modal__img" />
          </div>

          <input 
            ref="inputRef"
            type="text" 
            v-model="captchaKey" 
            class="input captcha-modal__input" 
            placeholder="Введите код"
            @keydown.enter="submit"
          />
        </div>

        <div class="captcha-modal__footer">
          <button class="captcha-modal__cancel-btn" @click="cancel">
            Отмена
          </button>
          <button class="btn btn--primary" @click="submit" :disabled="!captchaKey.trim()">
            Подтвердить
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.captcha-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.captcha-modal {
  background: var(--bg-elev);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg, 16px);
  width: 100%;
  max-width: 340px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.captcha-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.captcha-modal__title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-0);
}

.captcha-modal__title-group h2 {
  margin: 0;
  font-size: calc(16px * var(--font-scale, 1));
  font-weight: 700;
}

.captcha-modal__close-btn {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  transition: background 0.2s, color 0.2s;
}

.captcha-modal__close-btn:hover {
  background: var(--bg-3);
  color: var(--text-0);
}

.captcha-modal__body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.captcha-modal__desc {
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-1);
  line-height: 1.4;
  margin: 0;
}

.captcha-modal__img-wrapper {
  background: var(--bg-2);
  border-radius: var(--radius-md, 8px);
  padding: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  border: 1px solid var(--border);
}

.captcha-modal__img {
  max-width: 100%;
  height: 50px;
  border-radius: 4px;
}

.captcha-modal__input {
  width: 100%;
  background: var(--bg-3);
  border: 1px solid var(--border-strong);
  color: var(--text-0);
  border-radius: var(--radius-sm, 6px);
  padding: 10px 12px;
  font-size: calc(14px * var(--font-scale, 1));
  transition: border-color 0.2s, box-shadow 0.2s;
}

.captcha-modal__input:focus {
  outline: none;
  border-color: var(--accent-1);
  box-shadow: 0 0 0 2px rgba(var(--accent-1-rgb), 0.2);
}

.captcha-modal__footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  align-items: center;
}

.captcha-modal__cancel-btn {
  background: transparent;
  border: none;
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s, background-color 0.2s;
  padding: 8px 16px;
  border-radius: 6px;
}

.captcha-modal__cancel-btn:hover {
  color: var(--text-0);
  background: var(--bg-2);
}

/* Transitions & Keyframes */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@keyframes modal-in {
  from {
    transform: translateY(15px) scale(0.96);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
</style>
