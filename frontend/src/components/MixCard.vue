<script setup lang="ts">
import type { ActionItem } from "@/api/types";
import Spinner from "@/components/Spinner.vue";

defineProps<{
  action: ActionItem;
  loading?: boolean;
}>();

const emit = defineEmits<{ click: [] }>();
</script>

<template>
  <button class="mix-card" @click="emit('click')" v-lazy-bg="action.url || ''">
    <div class="mix-card__overlay"></div>
    <div class="mix-card__play" :class="{ 'mix-card__play--loading': loading }">
      <Spinner v-if="loading" :size="32" color="#fff" />
      <svg v-else viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
    <div class="mix-card__content">
      <div class="mix-card__top">
        <div class="mix-card__title">{{ action.title }}</div>
        <div v-if="action.description" class="mix-card__description" :title="action.description">{{ action.description }}</div>
      </div>
      <div class="mix-card__bottom" v-if="action.foreground_url">
        <div class="mix-card__avatar-wrap">
          <img :src="action.foreground_url" class="mix-card__avatar" alt="Artist Avatar" />
        </div>
      </div>
    </div>
  </button>
</template>

<style scoped>
.mix-card {
  position: relative;
  width: 170px;
  height: 220px;
  flex: 0 0 170px;
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: transform var(--motion-duration-fast) var(--motion-ease-out),
              box-shadow var(--motion-duration-fast) var(--motion-ease-out);
  cursor: pointer;
  border: none;
  padding: 0;
  background-size: cover;
  background-position: center;
  display: flex;
  flex-direction: column;
}
.mix-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}
.mix-card__overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.1) 50%, rgba(0, 0, 0, 0.25) 100%);
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
  z-index: 2;
  pointer-events: none;
}
.mix-card:hover .mix-card__overlay {
  background: rgba(0, 0, 0, 0.4);
}
.mix-card__play {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0.8);
  opacity: 0;
  z-index: 4;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  color: #fff;
}
.mix-card:hover .mix-card__play, .mix-card__play--loading {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
.mix-card__content {
  position: absolute;
  inset: 0;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  color: #fff;
  z-index: 3;
  min-width: 0;
}
.mix-card__top {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  min-width: 0;
  width: 100%;
}
.mix-card__title {
  font-size: calc(20px * var(--font-scale, 1));
  font-weight: 800;
  line-height: 1.15;
  text-transform: uppercase;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
.mix-card__description {
  font-size: calc(11px * var(--font-scale, 1));
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}
.mix-card__bottom {
  display: flex;
  justify-content: center;
  width: 100%;
  margin-top: auto;
}
.mix-card__avatar-wrap {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  overflow: hidden;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
  transform: translateY(22px);
  transition: transform 0.25s var(--motion-ease-out);
}
.mix-card:hover .mix-card__avatar-wrap {
  transform: translateY(14px) scale(1.03);
}
.mix-card__avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
