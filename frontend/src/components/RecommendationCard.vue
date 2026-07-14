<script setup lang="ts">
import { computed } from "vue";
import { useMotion } from "@/composables/useSpring";
import type { AlbumSummary } from "@/api/types";
import { tracksLabel } from "@/composables/useFormat";

const props = defineProps<{
  block: AlbumSummary;
  index?: number;
  loading?: boolean;
  showHoverMeta?: boolean;
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

const coverCache = new Map<string, string>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function generateReededCover(baseColor: string, id: string): string {
  const cacheKey = `${id}_${baseColor}`;
  if (coverCache.has(cacheKey)) {
    return coverCache.get(cacheKey)!;
  }

  // Seeded random helper
  let seed = 0;
  for (let i = 0; i < cacheKey.length; i++) {
    seed = (seed << 5) - seed + cacheKey.charCodeAt(i);
    seed |= 0;
  }
  function random() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  const width = 300;
  const height = 400;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  // 1. Parse base color
  let r = 120, g = 120, b = 120;
  const hex = baseColor.replace("#", "");
  if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  }

  const [h] = rgbToHsl(r, g, b);

  // Generate exactly 1 single solid color per card (soft matte tone)
  const randomHue = (h + Math.floor(random() * 80) - 40 + 360) % 360;
  const sVal = 50 + Math.floor(random() * 20);
  const lVal = 35 + Math.floor(random() * 15);

  ctx.fillStyle = `hsl(${randomHue}, ${sVal}%, ${lVal}%)`;
  ctx.fillRect(0, 0, width, height);

  // Draw a subtle matte paper noise texture on top
  const imgData = ctx.getImageData(0, 0, width, height);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (random() - 0.5) * 8;
    d[i] = Math.min(255, Math.max(0, d[i] + noise));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
  }
  ctx.putImageData(imgData, 0, 0);

  // Clean subtle inner border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.94);
  coverCache.set(cacheKey, dataUrl);
  return dataUrl;
}

const background = computed(() => {
  if (props.block.type === "generated" && props.block.main_color) {
    const dataUrl = generateReededCover(props.block.main_color, props.block.id);
    return `url(${dataUrl}) center/cover`;
  }
  if (props.block.cover) {
    return `linear-gradient(180deg, rgba(8, 9, 14, 0.4), rgba(8, 9, 14, 0.0) 50%), url(${props.block.cover}) center/cover`;
  }
  return "linear-gradient(135deg, var(--accent-1), var(--accent-3))";
});
</script>

<template>
  <button v-motion="variants" class="rec-card" :class="{'rec-card--hover-meta': showHoverMeta}" :style="{ background }" @click="$emit('open', block)">
    <div class="rec-card__overlay"></div>
    <div class="rec-card__play" :class="{ 'rec-card__play--loading': loading }">
      <Spinner v-if="loading" :size="32" color="#fff" />
      <svg v-else viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    </div>
    <div v-if="(block.year || block.track_count) && showHoverMeta" class="rec-card__hover-meta">
      <span v-if="block.year">{{ block.year }}</span>
      <span v-if="block.year && block.track_count">&bull;</span>
      <span v-if="block.track_count">{{ tracksLabel(block.track_count) }}</span>
    </div>
    <div class="rec-card__content">
      <div class="rec-card__top">
        <div class="rec-card__title">{{ block.title }}</div>
        <div v-if="block.subtitle" class="rec-card__subtitle">{{ block.subtitle }}</div>
      </div>
      <div class="rec-card__bottom">
        <div class="rec-card__icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <clipPath id="vk-round-corners">
                <rect x="1.1" y="1.1" width="21.8" height="21.8" rx="6.4"/>
              </clipPath>
              <mask id="vk-music-cutout">
                <rect x="0" y="0" width="24" height="24" fill="white"/>
                <rect x="3.25" y="15" width="2.5" height="3.5" rx="1.25" fill="black"/>
                <rect x="7" y="13.5" width="2.5" height="5.5" rx="1.25" fill="black"/>
                <rect x="10.75" y="10" width="2.5" height="9.5" rx="1.25" fill="black"/>
                <rect x="14.5" y="11.5" width="2.5" height="7.5" rx="1.25" fill="black"/>
                <rect x="18.25" y="14.5" width="2.5" height="4" rx="1.25" fill="black"/>
              </mask>
            </defs>
            <g mask="url(#vk-music-cutout)">
              <rect x="2" y="2" width="20" height="20" rx="5.5" stroke="currentColor" stroke-width="1.8"/>
              <path d="M0 14.5 C 6 14.5, 10 7.5, 16 7.5 C 19 7.5, 24 9, 24 9 L 24 24 L 0 24 Z" fill="currentColor" clip-path="url(#vk-round-corners)"/>
            </g>
          </svg>
        </div>
      </div>
    </div>
  </button>
</template>

<style scoped>
.rec-card {
  position: relative;
  aspect-ratio: 3 / 4;
  flex: 0 0 170px;
  width: 170px;
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
  cursor: pointer;
  padding: 0;
}
.rec-card__overlay {
  position: absolute;
  inset: 0;
  background: transparent;
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
  z-index: 2;
  pointer-events: none;
}
.rec-card:hover .rec-card__overlay {
  background: rgba(0, 0, 0, 0.4);
}
.rec-card__play {
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
  z-index: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
}
.rec-card__top {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rec-card__title {
  font-size: calc(22px * var(--font-scale, 1));
  font-weight: 800;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  text-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.rec-card__subtitle {
  font-size: calc(13px * var(--font-scale, 1));
  opacity: 0.85;
  font-weight: 500;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
  text-shadow: 0 1px 2px rgba(0,0,0,0.15);
}
.rec-card__bottom {
  display: flex;
  justify-content: flex-start;
}
.rec-card--hover-meta .rec-card__bottom {
  transition: opacity var(--motion-duration-fast) var(--motion-ease-out);
}
.rec-card--hover-meta:hover .rec-card__bottom {
  opacity: 0;
}
.rec-card__hover-meta {
  position: absolute;
  bottom: 16px;
  left: 0;
  right: 0;
  text-align: center;
  font-size: calc(11px * var(--font-scale, 1));
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
  opacity: 0;
  transform: translateY(10px);
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
  z-index: 3;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  text-transform: uppercase;
  letter-spacing: calc(0.05em + var(--letter-spacing, 0px));
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
}
.rec-card--hover-meta:hover .rec-card__hover-meta {
  opacity: 1;
  transform: translateY(0);
}
.rec-card__icon {
  color: #fff;
  opacity: 0.9;
  display: flex;
}
</style>
