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
        {{ t.message }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  bottom: calc(var(--player-height) + 16px);
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
  box-shadow: var(--shadow-md);
  color: var(--text-0);
  font-size: 13px;
  font-weight: 500;
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}
.toast--success {
  border-color: rgba(43, 196, 138, 0.5);
}
.toast--error {
  border-color: rgba(255, 94, 126, 0.5);
}
</style>
