<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue';

const props = withDefaults(defineProps<{
  active?: boolean;
  width?: string | number;
  height?: string | number;
}>(), {
  width: 18,
  height: 18
});

const emit = defineEmits<{
  (e: 'action', evt: MouseEvent): void;
}>();

const removing = ref(false);
let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

watch(() => props.active, (newVal, oldVal) => {
  if (oldVal && !newVal) {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    removing.value = false;
  }
});

onBeforeUnmount(() => {
  if (fallbackTimer) clearTimeout(fallbackTimer);
});

function handleClick(evt: MouseEvent) {
  if (props.active) {
    removing.value = true;
    setTimeout(() => {
      emit('action', evt);
    }, 400);
    
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      removing.value = false;
    }, 2000);
  } else {
    emit('action', evt);
  }
}
</script>

<template>
  <button 
    class="heart-wrapper" 
    :class="{ 'is-active': active, 'is-removing': removing }"
    @click.stop="handleClick"
  >
    <svg 
      viewBox="0 0 24 24" 
      class="heart-svg" 
      stroke-linecap="round" 
      stroke-linejoin="round"
      :style="{ width: typeof width === 'number' ? width + 'px' : width, height: typeof height === 'number' ? height + 'px' : height }"
    >
      <defs>
        <clipPath id="crack-left">
          <polygon points="0 0, 12 0, 12 5, 10 7, 12 9, 10 11, 11 14, 12 24, 0 24" />
        </clipPath>
        <clipPath id="crack-right">
          <polygon points="24 0, 12 0, 12 5, 10 7, 12 9, 10 11, 11 14, 12 24, 24 24" />
        </clipPath>
      </defs>

      <path 
        class="heart-outline" 
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        fill="none" 
        stroke="currentColor" 
        stroke-width="2.2"
      />
      <path 
        class="heart-filled" 
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
      />
      <path 
        class="heart-crack" 
        d="M12 5 L10 7 L12 9 L10 11 L11 14 L12 24"
        fill="none"
        stroke="var(--bg-color, #1e1e1e)" 
        stroke-width="2"
      />
      <g class="heart-break-left" clip-path="url(#crack-left)">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </g>
      <g class="heart-break-right" clip-path="url(#crack-right)">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </g>
    </svg>
  </button>
</template>

<style scoped>
.heart-wrapper {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-color, #fff);
  --heart-color: var(--accent-1, #ff0055);
  --bg-color: var(--bg-surface, #1e1e1e);
  background: transparent;
  border: none;
  padding: 0;
  outline: none;
}

.heart-svg {
  overflow: visible;
}

.heart-outline {
  opacity: 1;
  transform: scale(1);
  transform-origin: 12px 12px;
  transition: opacity 0.2s ease, transform 0.3s ease, color 0.3s ease;
}

.heart-filled {
  fill: var(--heart-color);
  opacity: 0;
  transform: scale(0);
  transform-origin: 12px 12px;
}

.heart-crack {
  opacity: 0;
  stroke-dasharray: 24;
  stroke-dashoffset: 24;
  transition: opacity 0.2s ease, stroke-dashoffset 0.3s ease;
}

.heart-break-left, .heart-break-right {
  fill: var(--heart-color);
  display: none;
  transform-origin: center;
}

.heart-wrapper.is-active .heart-outline {
  color: var(--heart-color);
  opacity: 1;
}
.heart-wrapper.is-active .heart-filled {
  animation: heart-fill 0.3s ease-out forwards;
}

@keyframes heart-fill {
  0% { transform: scale(0); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.heart-wrapper.is-active:hover:not(.is-removing) .heart-crack {
  opacity: 1;
  stroke-dashoffset: 0;
}

.heart-wrapper.is-removing .heart-outline,
.heart-wrapper.is-removing .heart-filled,
.heart-wrapper.is-removing .heart-crack {
  display: none;
}

.heart-wrapper.is-removing .heart-break-left,
.heart-wrapper.is-removing .heart-break-right {
  display: block;
}

.heart-wrapper.is-removing .heart-break-left {
  animation: heart-break-l 0.4s forwards cubic-bezier(0.55, 0.085, 0.68, 0.53);
}

.heart-wrapper.is-removing .heart-break-right {
  animation: heart-break-r 0.4s forwards cubic-bezier(0.55, 0.085, 0.68, 0.53);
}

@keyframes heart-break-l {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate(-8px, 12px) rotate(-15deg); opacity: 0; }
}
@keyframes heart-break-r {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  100% { transform: translate(8px, 12px) rotate(15deg); opacity: 0; }
}
</style>