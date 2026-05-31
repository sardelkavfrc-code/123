<script setup lang="ts">
import { computed } from "vue";
import { useMotion } from "@/composables/useSpring";
import type { AlbumSummary } from "@/api/types";

const props = defineProps<{
  block: AlbumSummary;
  index?: number;
  loading?: boolean;
}>();

import Spinner from "@/components/Spinner.vue";

defineEmits<{ open: [block: AlbumSummary] }>();

const motion = useMotion();
const variants = computed(() =>
  motion.spring(
    { opacity: 0, y: 16, scale: 0.96 },
    { opacity: 1, y: 0, scale: 1 },
    { stiffness: 260, damping: 24, delay: (props.index ?? 0) * 0.04 }
  )
);

const background = computed(() => {
  if (props.block.cover) {
    return `linear-gradient(180deg, rgba(8, 9, 14, 0.05), rgba(8, 9, 14, 0.55)), url(${props.block.cover}) center/cover`;
  }
  return "linear-gradient(135deg, var(--accent-1), var(--accent-3))";
});
</script>

<template>
  <button v-motion="variants" class="rec-card" :style="{ background }" @click="$emit('open', block)">
    <div class="rec-card__overlay"></div>
    <div class="rec-card__play" :class="{ 'rec-card__play--loading': loading }">
      <Spinner v-if="loading" :size="32" color="#fff" />
      <svg v-else viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
    <div class="rec-card__content">
      <div class="rec-card__top">
        <div class="rec-card__title">{{ block.title }}</div>
        <div v-if="block.subtitle" class="rec-card__subtitle">{{ block.subtitle }}</div>
      </div>
    </div>
  </button>
</template>

<style scoped>
.rec-card {
  position: relative;
  aspect-ratio: 3 / 4;
  min-width: 0;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  background-size: cover;
  color: #fff;
  text-align: left;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  border: none;
  box-shadow: var(--shadow-md);
  cursor: pointer;
  padding: 0;
}
.rec-card__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, rgba(0, 0, 0, 0.1) 100%);
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
  z-index: 1;
}
.rec-card:hover .rec-card__overlay {
  background: linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.4) 100%);
}
.rec-card__play {
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
  width: 54px;
  height: 54px;
  border-radius: 50%;
  background: rgba(0,0,0,0.3);
  backdrop-filter: blur(4px);
  color: #fff;
}
.rec-card:hover .rec-card__play, .rec-card__play--loading {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
.rec-card__content {
  position: relative;
  z-index: 2;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
}
.rec-card__top {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rec-card__title {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}
.rec-card__subtitle {
  font-size: 13px;
  opacity: 0.85;
  font-weight: 500;
}
</style>
