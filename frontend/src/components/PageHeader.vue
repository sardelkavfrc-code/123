<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title: string;
  subtitle?: string;
}>();
</script>

<template>
  <header class="page-header">
    <div v-if="eyebrow" class="page-header__eyebrow">{{ eyebrow }}</div>
    <h1 class="page-header__title">{{ title }}</h1>
    <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
    <div v-if="$slots.actions" class="page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 28px 32px 12px;
}
.page-header__eyebrow {
  font-size: calc(11px * var(--font-scale, 1));
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-2);
  font-weight: 600;
}
.page-header__title {
  margin: 0;
  font-size: calc(30px * var(--font-scale, 1));
  font-weight: 700;
  letter-spacing: -0.01em;
}
.page-header__subtitle {
  margin: 0;
  color: var(--text-2);
  max-width: 720px;
  font-size: calc(14px * var(--font-scale, 1));
}
.page-header__actions {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
