<script setup lang="ts">
import { computed } from "vue";

const platform = computed(() => window.vkmp?.platform ?? "web");
const isMac = computed(() => platform.value === "darwin");

function minimize() {
  window.vkmp?.minimize();
}
function maximize() {
  window.vkmp?.maximize();
}
function close() {
  window.vkmp?.close();
}
</script>

<template>
  <header class="titlebar app-titlebar-drag">
    <div class="titlebar__brand">
      <span class="titlebar__logo accent-gradient" />
      <span class="titlebar__name">VK Music</span>
    </div>
    <div v-if="!isMac" class="titlebar__controls app-titlebar-no-drag">
      <button class="titlebar__btn" aria-label="Свернуть" title="Свернуть" @click="minimize">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2" y="5.5" width="8" height="1" rx="0.5" fill="currentColor"/></svg>
      </button>
      <button class="titlebar__btn" aria-label="Развернуть" title="Развернуть" @click="maximize">
        <svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" fill="none"/></svg>
      </button>
      <button class="titlebar__btn titlebar__btn--close" aria-label="Закрыть" title="Закрыть" @click="close">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </header>
</template>

<style scoped>
.titlebar {
  flex: 0 0 var(--titlebar-height);
  height: var(--titlebar-height);
  min-height: var(--titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 16px;
  background: transparent;
  color: var(--text-1);
  border-bottom: 1px solid var(--border);
}
.titlebar__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  font-size: calc(12px * var(--font-scale, 1));
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-1);
}
.titlebar__logo {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  display: inline-block;
}
.titlebar__name {
  color: var(--text-0);
}
.titlebar__controls {
  display: inline-flex;
  gap: 4px;
}
.titlebar__btn {
  width: 30px;
  height: 26px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-2);
  transition: background var(--motion-duration-fast) var(--motion-ease-out), color var(--motion-duration-fast) var(--motion-ease-out);
}
.titlebar__btn:hover {
  background: var(--bg-2);
  color: var(--text-0);
}
.titlebar__btn--close:hover {
  background: var(--danger);
  color: white;
}
</style>
