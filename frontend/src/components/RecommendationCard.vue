<script setup lang="ts">
import { computed } from "vue";
import { useMotion } from "@/composables/useSpring";
import type { RecommendationBlock } from "@/api/types";

const props = defineProps<{
  block: RecommendationBlock;
  index?: number;
  variant?: "default" | "wide";
}>();

defineEmits<{ open: [block: RecommendationBlock] }>();

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
  return props.block.accent ?? "linear-gradient(135deg, var(--accent-1), var(--accent-3))";
});
</script>

<template>
  <button
    v-motion="variants"
    class="rec-card hover-lift"
    :class="{ 'rec-card--wide': variant === 'wide' }"
    :style="{ background }"
    @click="$emit('open', block)"
  >
    <div class="rec-card__top">
      <div class="rec-card__title">{{ block.title }}</div>
      <div v-if="block.subtitle" class="rec-card__subtitle">{{ block.subtitle }}</div>
    </div>
    <div class="rec-card__bottom">
      <div class="rec-card__icon">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <rect x="3" y="14" width="3" height="6" rx="1.5" />
          <rect x="8" y="9" width="3" height="11" rx="1.5" />
          <rect x="13" y="4" width="3" height="16" rx="1.5" />
          <rect x="18" y="11" width="3" height="9" rx="1.5" />
        </svg>
      </div>
      <div v-if="block.track_count" class="rec-card__count">{{ block.track_count }} треков</div>
    </div>
  </button>
</template>

<style scoped>
.rec-card {
  position: relative;
  aspect-ratio: 3 / 4;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  background-size: cover;
  color: #fff;
  text-align: left;
  padding: 16px 16px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  border: none;
  box-shadow: var(--shadow-md);
  min-height: 200px;
}
.rec-card--wide {
  aspect-ratio: 3.6 / 1.6;
  min-height: 72px;
  padding: 14px 12px;
}
.rec-card--wide .rec-card__title {
  font-size: 16px;
}
.rec-card--wide .rec-card__subtitle,
.rec-card--wide .rec-card__count {
  display: none;
}
.rec-card--wide .rec-card__bottom {
  justify-content: flex-end;
}
.rec-card--wide .rec-card__icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: var(--bg-0);
  background: #fff;
}
.rec-card::after {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 80% 0%, rgba(255, 255, 255, 0.12), transparent 60%);
  pointer-events: none;
}
.rec-card__top {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rec-card__title {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}
.rec-card__subtitle {
  font-size: 13px;
  opacity: 0.85;
  font-weight: 500;
}
.rec-card__bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.rec-card__icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.32);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.rec-card__count {
  font-size: 11px;
  opacity: 0.85;
  background: rgba(0, 0, 0, 0.32);
  padding: 4px 8px;
  border-radius: 999px;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
</style>
