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
        <svg v-if="t.kind === 'success'" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2 5.5 12.7 4 14.2 9 19.2 20 8.2 18.5 6.7z"/></svg>
        <svg v-else-if="t.kind === 'error'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="12" cy="12" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="12" cy="18" r="2"/></svg>
        {{ t.message }}
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
  z-index: 1000;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  padding: 10px 16px;
  border-radius: 999px;
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  color: var(--text-0);
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 500;
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  display: flex;
  align-items: center;
  gap: 8px;
}
.toast--success {
  border-color: rgba(43, 196, 138, 0.5);
  color: #2bc48a;
}
.toast--success svg {
  color: #2bc48a;
}
.toast--error {
  border-color: rgba(255, 94, 126, 0.5);
  color: #ff5e7e;
}
.toast--error svg {
  color: #ff5e7e;
}
</style>
