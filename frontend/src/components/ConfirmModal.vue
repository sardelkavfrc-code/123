<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { useUIStore } from "@/stores/ui";

const ui = useUIStore();

function handleKeydown(e: KeyboardEvent) {
  if (!ui.confirmModalOpen) return;
  if (e.key === "Enter") {
    e.preventDefault();
    ui.resolveConfirm();
  } else if (e.key === "Escape") {
    e.preventDefault();
    ui.cancelConfirm();
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Transition name="confirm-fade">
    <div v-if="ui.confirmModalOpen" class="confirm-overlay" @mousedown.self="ui.cancelConfirm">
      <div class="confirm-modal">
        <div class="confirm-modal__header">
          <h3>{{ ui.confirmModalTitle }}</h3>
          <button class="btn btn--ghost icon-only" @click="ui.cancelConfirm" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        
        <div class="confirm-modal__body">
          <p class="confirm-message">{{ ui.confirmModalMessage }}</p>
        </div>
        
        <div class="confirm-modal__footer">
          <button class="btn btn--ghost" @click="ui.cancelConfirm">
            {{ ui.confirmModalCancelText }}
          </button>
          <button class="btn btn--danger" @click="ui.resolveConfirm">
            {{ ui.confirmModalConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.confirm-modal {
  width: 100%;
  max-width: 420px;
  background: var(--bg-1);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.confirm-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 12px 24px;
}

.confirm-modal__header h3 {
  margin: 0;
  font-size: calc(18px * var(--font-scale, 1));
  font-weight: 700;
  color: var(--text-0);
}

.confirm-modal__body {
  padding: 0 24px;
}

.confirm-message {
  margin: 0;
  font-size: calc(14px * var(--font-scale, 1));
  color: var(--text-1); /* slightly muted */
  line-height: 1.6;
}

.confirm-modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 24px;
}

/* Transitions */
.confirm-fade-enter-active,
.confirm-fade-leave-active {
  transition: opacity 0.2s ease;
}

.confirm-fade-enter-from,
.confirm-fade-leave-to {
  opacity: 0;
}

.confirm-fade-enter-active .confirm-modal {
  animation: modalSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
