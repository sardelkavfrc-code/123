<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
  icon?: string;
}>();
</script>

<template>
  <div class="empty">
    <div class="empty__icon">{{ icon ?? "♪" }}</div>
    <div class="empty__title">{{ title }}</div>
    <div v-if="subtitle" class="empty__subtitle">{{ subtitle }}</div>
    <slot />
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  text-align: center;
  color: var(--text-2);
  gap: 6px;
  min-height: 240px;
}
.empty__icon {
  font-size: 48px;
  opacity: 0.5;
  margin-bottom: 8px;
}
.empty__title {
  color: var(--text-0);
  font-weight: 600;
  font-size: 16px;
}
.empty__subtitle {
  max-width: 360px;
  font-size: 13px;
}
</style>
