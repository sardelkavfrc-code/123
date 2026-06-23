<script setup lang="ts">
import type { AlbumSummary } from "@/api/types";

import Spinner from "@/components/Spinner.vue";

defineProps<{
  mood: AlbumSummary;
  loading?: boolean;
}>();

const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <button class="mood-card" @click="emit('click')" v-lazy-bg="mood.cover || ''">
    <div class="mood-card__overlay"></div>
    <div class="mood-card__play" :class="{ 'mood-card__play--loading': loading }">
      <Spinner v-if="loading" :size="24" color="#fff" />
      <svg v-else viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
    <div class="mood-card__content">
      <div class="mood-card__title">{{ mood.title }}</div>
    </div>
  </button>
</template>

<style scoped>
.mood-card {
  position: relative;
  width: 150px;
  height: 96px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: relative;
  transition: transform var(--motion-duration-fast) var(--motion-ease-out);
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  padding: 0;
  background-size: cover;
  background-position: center;
}
.mood-card__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.4) 0%, transparent 60%);
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
  z-index: 2;
  pointer-events: none;
}
.mood-card:hover .mood-card__overlay {
  background: rgba(0, 0, 0, 0.4);
}
.mood-card__play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.8);
  opacity: 0;
  z-index: 3;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(4px);
  color: #fff;
}
.mood-card:hover .mood-card__play, .mood-card__play--loading {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
.mood-card__content {
  position: absolute;
  inset: 0;
  padding: 10px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  color: #fff;
  z-index: 1;
}
.mood-card__title {
  font-size: calc(17px * var(--font-scale, 1));
  font-weight: 700;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
