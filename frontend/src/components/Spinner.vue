<script setup lang="ts">
defineProps<{ size?: number }>();
</script>

<template>
  <span class="spinner" :style="{ width: (size ?? 18) + 'px', height: (size ?? 18) + 'px' }" role="status">
    <svg viewBox="0 0 24 24" :width="(size ?? 18)" :height="(size ?? 18)">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="14 30" />
    </svg>
  </span>
</template>

<style scoped>
.spinner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-1);
  animation: spin 0.9s linear infinite;
}
[data-perf="on"] .spinner {
  animation: none;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
