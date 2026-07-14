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

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  s /= 100;
  l /= 100;
  let r = l, g = l, b = l;

  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    r = hue2rgb(h + 1/3);
    g = hue2rgb(h);
    b = hue2rgb(h - 1/3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function shiftColor(r: number, g: number, b: number, dh: number, ds: number, dl: number): string {
  const [h, s, l] = rgbToHsl(r, g, b);
  const nh = (h + dh + 360) % 360;
  const ns = Math.min(100, Math.max(0, s + ds));
  const nl = Math.min(100, Math.max(0, l + dl));
  const [nr, ng, nb] = hslToRgb(nh, ns, nl);
  return `rgb(${nr}, ${ng}, ${nb})`;
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

  // 2. Base gradient background values (high-saturation dual-tone)
  const [h, s, l] = rgbToHsl(r, g, b);
  const shiftedHue = (h + 18 + random() * 12) % 360;
  const [sr, sg, sb] = hslToRgb(shiftedHue, Math.min(100, s * 1.05), Math.min(95, l * 1.1));
  const [er, eg, eb] = hslToRgb((h - 22 + 360) % 360, Math.min(100, s * 1.05), Math.max(22, l * 0.72));

  const color1 = `rgb(${sr}, ${sg}, ${sb})`;
  const color2 = `rgb(${er}, ${eg}, ${eb})`;

  // 3. Create a slightly larger canvas for the base background to prevent edge bleeding halos
  const bgW = width + 40;
  const bgH = height + 40;
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = bgW;
  bgCanvas.height = bgH;
  const bgCtx = bgCanvas.getContext("2d");
  if (bgCtx) {
    // A. Draw base gradient
    const baseGrad = bgCtx.createLinearGradient(0, 0, bgW, bgH);
    baseGrad.addColorStop(0, color1);
    baseGrad.addColorStop(1, color2);
    bgCtx.fillStyle = baseGrad;
    bgCtx.fillRect(0, 0, bgW, bgH);

    // B. Draw a soft diagonal light reflection on background to enrich mirror effect
    const backShine = bgCtx.createLinearGradient(0, 0, bgW, bgH);
    backShine.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    backShine.addColorStop(0.35, "rgba(255, 255, 255, 0.0)");
    backShine.addColorStop(0.6, "rgba(0, 0, 0, 0.0)");
    backShine.addColorStop(1, "rgba(0, 0, 0, 0.12)");
    bgCtx.fillStyle = backShine;
    bgCtx.fillRect(0, 0, bgW, bgH);
  }

  // 4. Create an opaque slightly blurred canvas (blur(4px) for semi-sharp mirror reflection!)
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = bgW;
  blurCanvas.height = bgH;
  const bCtx = blurCanvas.getContext("2d");
  if (bCtx) {
    bCtx.filter = "blur(4px)";
    bCtx.drawImage(bgCanvas, 0, 0);
  }

  // Draw clean un-distorted background on main canvas
  ctx.drawImage(bgCanvas, 20, 20, width, height, 0, 0, width, height);

  // Get fast pixel access on blurred background
  const imgData = bCtx!.getImageData(0, 0, bgW, bgH);
  const d = imgData.data;

  function getBgColor(x: number, y: number): [number, number, number] {
    // Translate coords to the larger blur canvas space
    const cx = Math.max(0, Math.min(bgW - 1, Math.floor(x + 20)));
    const cy = Math.max(0, Math.min(bgH - 1, Math.floor(y + 20)));
    const idx = (cy * bgW + cx) * 4;
    return [d[idx], d[idx + 1], d[idx + 2]];
  }

  // Compute a highly saturated deep shadow color based on the base hue (no muddy grey shadows!)
  const [dr, dg, db] = hslToRgb(h, Math.min(100, s * 1.1), Math.max(8, l * 0.25));
  const shadowColorStr = `rgba(${dr}, ${dg}, ${db}`;

  const ribWidth = 26 + Math.floor(random() * 8); // 26 to 34px (perfect mirror strip size)
  const hasWaviness = random() > 0.25;
  const amp1 = 3 + random() * 3; // subtle wave distortion
  const amp2 = 1.5 + random() * 1.5;
  const freq1 = 0.005 + random() * 0.005;
  const freq2 = 0.012 + random() * 0.008;
  const phase1 = random() * Math.PI * 2;
  const phase2 = random() * Math.PI * 2;

  // 5. Create glass ribbed refraction canvas
  const ribCanvas = document.createElement("canvas");
  ribCanvas.width = width;
  ribCanvas.height = height;
  const rCtx = ribCanvas.getContext("2d");
  if (rCtx) {
    for (let y = 0; y < height; y += 2) {
      const xOffset = hasWaviness ? (Math.sin(y * freq1 + phase1) * amp1 + Math.sin(y * freq2 + phase2) * amp2) : 0;
      for (let x = -40; x < width + 40; x += ribWidth) {
        const curX = x + xOffset;
        
        // Mirror-flip sample coordinates with offset to simulate convex cylindrical mirror strips
        const leftRGB = getBgColor(curX - 45, y);
        const centerRGB = getBgColor(curX, y);
        const rightRGB = getBgColor(curX + 45, y);
        
        // Shift colors slightly to match mirror cylinder reflection lighting curve
        const edgeLeft = shiftColor(leftRGB[0], leftRGB[1], leftRGB[2], 0, 4, 6);
        const specRGB = getBgColor(curX - 15, y);
        const specC = shiftColor(specRGB[0], specRGB[1], specRGB[2], 6, 12, 16);
        const midC = `rgb(${centerRGB[0]}, ${centerRGB[1]}, ${centerRGB[2]})`;
        const shadowRGB = getBgColor(curX + 25, y);
        const shadowC = shiftColor(shadowRGB[0], shadowRGB[1], shadowRGB[2], -4, -8, -12);
        const ambientC = shiftColor(rightRGB[0], rightRGB[1], rightRGB[2], 2, 4, 4);
        const edgeRight = shiftColor(rightRGB[0], rightRGB[1], rightRGB[2], 0, 4, 6);

        const g = rCtx.createLinearGradient(curX, 0, curX + ribWidth, 0);
        g.addColorStop(0, edgeLeft);
        g.addColorStop(0.22, specC);
        g.addColorStop(0.5, midC);
        g.addColorStop(0.78, shadowC);
        g.addColorStop(0.9, ambientC);
        g.addColorStop(1, edgeRight);
        
        rCtx.fillStyle = g;
        rCtx.fillRect(curX, y, ribWidth, 2);
      }
    }
  }

  // 6. Create effect mask (defines where the glass cylinders are visible)
  const effectMaskCanvas = document.createElement("canvas");
  effectMaskCanvas.width = width;
  effectMaskCanvas.height = height;
  const emCtx = effectMaskCanvas.getContext("2d");
  if (emCtx) {
    const maskType = random();
    if (maskType < 0.35) {
      const maskGrad = emCtx.createLinearGradient(width, 0, 0, height);
      maskGrad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
      maskGrad.addColorStop(0.4, "rgba(255, 255, 255, 0.7)");
      maskGrad.addColorStop(0.8, "rgba(255, 255, 255, 0.15)");
      maskGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
      emCtx.fillStyle = maskGrad;
    } else if (maskType < 0.7) {
      const centerX = width * (0.2 + random() * 0.6);
      const centerY = height * (0.2 + random() * 0.5);
      const radius = 180 + random() * 150;
      const maskGrad = emCtx.createRadialGradient(centerX, centerY, 20, centerX, centerY, radius);
      maskGrad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
      maskGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.45)");
      maskGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");
      emCtx.fillStyle = maskGrad;
    } else {
      const maskGrad = emCtx.createLinearGradient(0, 0, width, 0);
      maskGrad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
      maskGrad.addColorStop(0.35, "rgba(255, 255, 255, 0.15)");
      maskGrad.addColorStop(0.65, "rgba(255, 255, 255, 0.15)");
      maskGrad.addColorStop(1, "rgba(255, 255, 255, 0.9)");
      emCtx.fillStyle = maskGrad;
    }
    emCtx.fillRect(0, 0, width, height);
  }

  // 7. Draw the masked ribs onto the main canvas
  const finalRibsCanvas = document.createElement("canvas");
  finalRibsCanvas.width = width;
  finalRibsCanvas.height = height;
  const frCtx = finalRibsCanvas.getContext("2d");
  if (frCtx) {
    frCtx.drawImage(ribCanvas, 0, 0);
    frCtx.globalCompositeOperation = "destination-in";
    frCtx.drawImage(effectMaskCanvas, 0, 0);
  }
  ctx.drawImage(finalRibsCanvas, 0, 0);

  // 8. Draw 3D highlights and shadows on top of the columns (applying the effect mask)
  const overlaysCanvas = document.createElement("canvas");
  overlaysCanvas.width = width;
  overlaysCanvas.height = height;
  const oCtx = overlaysCanvas.getContext("2d");
  if (oCtx) {
    for (let y = 0; y < height; y += 2) {
      const xOffset = hasWaviness ? (Math.sin(y * freq1 + phase1) * amp1 + Math.sin(y * freq2 + phase2) * amp2) : 0;
      for (let x = -40; x < width + 40; x += ribWidth) {
        const curX = x + xOffset;
        
        const borderAlpha = 0.08 + 0.10 * Math.sin(y / height * Math.PI);
        const shadowAlpha = 0.18 + 0.14 * Math.sin(y / height * Math.PI);
        
        // Left Fresnel border (bright specular edge)
        oCtx.fillStyle = `rgba(255, 255, 255, ${borderAlpha})`;
        oCtx.fillRect(curX, y, 1.2, 2);
        
        // Right shadow boundary gap (creates the 3D mirror separation between tubes)
        oCtx.fillStyle = `${shadowColorStr}, ${shadowAlpha})`;
        oCtx.fillRect(curX + ribWidth - 1.5, y, 1.5, 2);
        
        // Mirror peak specular line (representing light source reflection)
        const peakAlpha = 0.12 + 0.14 * Math.sin(y / height * Math.PI);
        oCtx.fillStyle = `rgba(255, 255, 255, ${peakAlpha})`;
        oCtx.fillRect(curX + Math.floor(ribWidth * 0.22), y, 1.2, 2);
        
        // Soft cylinder shading to make the flat blurred background look round
        const cylinderGrad = oCtx.createLinearGradient(curX, 0, curX + ribWidth, 0);
        cylinderGrad.addColorStop(0, "rgba(255, 255, 255, 0.04)");
        cylinderGrad.addColorStop(0.2, "rgba(255, 255, 255, 0.10)");
        cylinderGrad.addColorStop(0.4, "rgba(0, 0, 0, 0.0)");
        cylinderGrad.addColorStop(0.78, `${shadowColorStr}, 0.12)`);
        cylinderGrad.addColorStop(1, "rgba(255, 255, 255, 0.03)");
        oCtx.fillStyle = cylinderGrad;
        oCtx.fillRect(curX, y, ribWidth, 2);
      }
    }
    
    oCtx.globalCompositeOperation = "destination-in";
    oCtx.drawImage(effectMaskCanvas, 0, 0);
  }
  ctx.drawImage(overlaysCanvas, 0, 0);

  // 10. Add premium glassy specular highlight overlay
  const flare = ctx.createLinearGradient(0, 0, width, height * 0.8);
  flare.addColorStop(0, "rgba(255, 255, 255, 0.06)");
  flare.addColorStop(0.25, "rgba(255, 255, 255, 0.02)");
  flare.addColorStop(0.45, "rgba(255, 255, 255, 0.0)");
  ctx.fillStyle = flare;
  ctx.fillRect(0, 0, width, height);

  // 11. Glass inner border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
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
