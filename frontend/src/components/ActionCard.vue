<script setup lang="ts">
import { computed } from "vue";
import type { ActionItem } from "@/api/types";
import Spinner from "@/components/Spinner.vue";

const props = defineProps<{
  action: ActionItem;
  loading?: boolean;
}>();

const emit = defineEmits<{ click: [] }>();

const gradients = [
  "linear-gradient(135deg, #FF6B6B, #FF8E53)",
  "linear-gradient(135deg, #4E65FF, #92EFFD)",
  "linear-gradient(135deg, #8A2387, #E94057)",
  "linear-gradient(135deg, #11998E, #38EF7D)",
  "linear-gradient(135deg, #654EA3, #EAAFC8)",
  "linear-gradient(135deg, #FF416C, #FF4B2B)",
  "linear-gradient(135deg, #00B4DB, #0083B0)",
  "linear-gradient(135deg, #FDC830, #F37335)",
  "linear-gradient(135deg, #DA22FF, #9733EE)",
  "linear-gradient(135deg, #1D976C, #93F9B9)",
  "linear-gradient(135deg, #FF5F6D, #FFC371)",
  "linear-gradient(135deg, #36D1DC, #5B86E5)",
];

function getGradientForTitle(title: string) {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

const isPlaceholder = computed(() => {
  return props.action.url && (props.action.url.includes("GD2xIvSepVc.png") || props.action.url.includes("3WW9MxPq978"));
});

const background = computed(() => {
  if (isPlaceholder.value) {
    return `url(/genre_placeholder.jpg)`;
  }
  if (props.action.url) {
    return `url(${props.action.url})`;
  }
  return getGradientForTitle(props.action.title);
});
</script>

<template>
  <button class="action-card" @click="emit('click')" :style="{ backgroundImage: background }">
    <div class="action-card__overlay"></div>
    <div class="action-card__play" :class="{ 'action-card__play--loading': loading }">
      <Spinner v-if="loading" :size="24" color="#fff" />
      <svg v-else viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
    <div class="action-card__content">
      <div class="action-card__title">{{ action.title }}</div>
    </div>
  </button>
</template>

<style scoped>
.action-card {
  position: relative;
  width: 100%;
  min-width: 145px;
  height: 54px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: relative;
  transition: transform var(--motion-duration-fast) var(--motion-ease-out);
  flex-shrink: 0;
  cursor: pointer;
  border: none;
  padding: 0;
  background-size: 100% 100%;
  background-position: center;
}
.action-card__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.4) 0%, transparent 60%);
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
  z-index: 2;
  pointer-events: none;
}
.action-card:hover .action-card__overlay {
  background: rgba(0, 0, 0, 0.4);
}
.action-card__play {
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
.action-card:hover .action-card__play, .action-card__play--loading {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
.action-card__content {
  position: absolute;
  inset: 0;
  padding: 10px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  color: #fff;
  z-index: 1;
}
.action-card__title {
  font-size: calc(17px * var(--font-scale, 1));
  font-weight: 700;
  line-height: 1.2;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: left;
}
</style>
