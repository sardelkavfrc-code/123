<script setup lang="ts">
import { computed } from "vue";
import type { AlbumSummary } from "@/api/types";
import { useRouter } from "vue-router";

import Spinner from "@/components/Spinner.vue";

const props = defineProps<{
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
      <div v-if="mood.subtitle" class="mood-card__subtitle">{{ mood.subtitle }}</div>
    </div>
  </button>
</template>

<style scoped>
.mood-card {
  position: relative;
  width: 150px;
  height: 90px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  text-align: left;
  background-color: var(--surface-2);
  background-size: cover;
  background-position: center;
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  padding: 0;
}
.mood-card__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.2) 60%, rgba(0, 0, 0, 0.1) 100%);
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
  z-index: 1;
}
.mood-card:hover .mood-card__overlay {
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.4) 100%);
}
.mood-card__play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.8);
  opacity: 0;
  z-index: 2;
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
  justify-content: flex-end;
  color: #fff;
}
.mood-card__title {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.mood-card__subtitle {
  font-size: 11px;
  opacity: 0.8;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
