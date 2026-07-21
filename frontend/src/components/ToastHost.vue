<script setup lang="ts">
import { storeToRefs } from "pinia";
import { useUIStore } from "@/stores/ui";

const ui = useUIStore();
const { toasts } = storeToRefs(ui);
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <transition-group name="pop">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="`toast--${t.kind}`"
        @click="ui.dismiss(t.id)"
      >
        <div class="toast__content">
          <svg v-if="t.kind === 'success'" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2 5.5 12.7 4 14.2 9 19.2 20 8.2 18.5 6.7z"/></svg>
          <svg v-else-if="t.kind === 'error'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="18" r="2"/></svg>
          <span class="toast__message">{{ t.message }}</span>
        </div>
        <button
          v-if="t.action"
          class="toast__action"
          @click.stop="t.action(); ui.dismiss(t.id)"
        >
          {{ t.actionLabel || 'Отменить' }}
        </button>
        <div class="toast__progress" :style="{ animationDuration: `${t.duration || 3200}ms` }" />
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  bottom: calc(var(--player-height) + 24px);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 20000;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  padding: 12px 18px;
  border-radius: 12px;
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  color: var(--text-0);
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 500;
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  position: relative;
  overflow: hidden;
  min-width: 280px;
}
.toast__content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.toast__message {
  line-height: 1.4;
}
.toast__action {
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-0);
  border: none;
  border-radius: 6px;
  padding: 5px 10px;
  font-size: calc(11px * var(--font-scale, 1));
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease, transform 0.2s ease;
  z-index: 2;
  flex-shrink: 0;
}
.toast__action:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}
.toast__action:active {
  transform: scale(0.95);
}
.toast__progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: 100%;
  transform-origin: left;
  animation: shrink linear forwards;
  z-index: 1;
}
@keyframes shrink {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
.toast--success {
  border-color: rgba(43, 196, 138, 0.4);
  color: #2bc48a;
}
.toast--success svg {
  color: #2bc48a;
}
.toast--success .toast__progress {
  background: #2bc48a;
}
.toast--success .toast__action {
  background: rgba(43, 196, 138, 0.15);
  color: #2bc48a;
}
.toast--success .toast__action:hover {
  background: rgba(43, 196, 138, 0.25);
}
.toast--error {
  border-color: rgba(255, 94, 126, 0.4);
  color: #ff5e7e;
}
.toast--error svg {
  color: #ff5e7e;
}
.toast--error .toast__progress {
  background: #ff5e7e;
}
.toast--error .toast__action {
  background: rgba(255, 94, 126, 0.15);
  color: #ff5e7e;
}
.toast--error .toast__action:hover {
  background: rgba(255, 94, 126, 0.25);
}
.toast--info .toast__progress {
  background: var(--accent-1);
}
</style>
