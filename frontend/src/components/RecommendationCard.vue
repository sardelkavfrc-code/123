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

  // 1. Parse base color
  let r = 120, g = 120, b = 120;
  const hex = baseColor.replace("#", "");
  if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  }

  const [h] = rgbToHsl(r, g, b);

  // Generate exactly 1 single solid random color per card (matte/soft tone)
  const randomHue = (h + Math.floor(random() * 80) - 40 + 360) % 360;
  const sVal = 55 + Math.floor(random() * 15);
  const lVal = 30 + Math.floor(random() * 10);
  const baseRGB = hslToRgb(randomHue, sVal, lVal);

  // Select a stable random letter or digit using seeded random
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789";
  const char = chars.charAt(Math.floor(random() * chars.length));
  
  const isDarker = random() > 0.5;
  const letterL = isDarker ? Math.max(15, lVal - 8) : Math.min(85, lVal + 8);
  const letterRGB = hslToRgb(randomHue, sVal, letterL);

  // Create canvas to draw the blurred letter mask (transparent background, white letter)
  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = width;
  blurCanvas.height = height;
  const bCtx = blurCanvas.getContext("2d");
  if (bCtx) {
    bCtx.filter = "blur(48px)";
    bCtx.font = "bold 1200px Inter, system-ui, sans-serif";
    bCtx.textAlign = "center";
    bCtx.textBaseline = "middle";
    bCtx.fillStyle = "white";
    bCtx.fillText(char, width / 2, height / 2 + 80);
  }

  // Create canvas to draw the sharp/solid letter mask
  const solidCanvas = document.createElement("canvas");
  solidCanvas.width = width;
  solidCanvas.height = height;
  const sCtx = solidCanvas.getContext("2d");
  if (sCtx) {
    sCtx.filter = "blur(20px)";
    sCtx.font = "bold 1200px Inter, system-ui, sans-serif";
    sCtx.textAlign = "center";
    sCtx.textBaseline = "middle";
    sCtx.fillStyle = "white";
    sCtx.fillText(char, width / 2, height / 2 + 80);
  }

  // Pack both masks into a single canvas (Red = Blurred alpha, Green = Solid alpha)
  const letterCanvas = document.createElement("canvas");
  letterCanvas.width = width;
  letterCanvas.height = height;
  const lCtx = letterCanvas.getContext("2d");
  if (lCtx && bCtx && sCtx) {
    const imgDataB = bCtx.getImageData(0, 0, width, height);
    const imgDataS = sCtx.getImageData(0, 0, width, height);
    const dB = imgDataB.data;
    const dS = imgDataS.data;
    for (let i = 0; i < dB.length; i += 4) {
      dB[i] = dB[i + 3];     // Red = Blurred alpha
      dB[i + 1] = dS[i + 3]; // Green = Solid alpha
      dB[i + 2] = 0;
      dB[i + 3] = 255;       // Fully opaque
    }
    lCtx.putImageData(imgDataB, 0, 0);
  }

  const seedTime = random(); // Freeze shader at a unique static state per card

  const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true });
  if (gl) {
    // Vertex shader
    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Fragment shader
    const fsSource = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      uniform vec3 baseColor;
      uniform vec3 letterColor;
      uniform sampler2D letterTexture;

      void main(void) {
        vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        vec2 texCoord = gl_FragCoord.xy / resolution;
        texCoord.y = 1.0 - texCoord.y; // Flip y for WebGL texture orientation

        float t = time * 0.05;
        float lineWidth = 0.0035;

        // Sample letter texture channels
        float a_blur = texture2D(letterTexture, texCoord).r;
        float a_solid = texture2D(letterTexture, texCoord).g;
        // Edge mask: active only along the boundaries of the letter shape, completely clearing shader from the letter body
        float edge = a_blur * (1.0 - a_solid * a_solid * a_solid * a_solid * a_solid * a_solid);

        vec3 shaderColor = vec3(0.0);
        for(int j = 0; j < 3; j++){
          for(int i=0; i < 5; i++){
            // Completely vertical lines and higher density (frequency multiplier 36.0)
            float coord = uv.x * 36.0 - t - 0.05 * float(j) + float(i) * 0.05;
            // Sawtooth wave: f goes from 0.0 (peak) to 1.0 (end of period), spanning 100% of the space
            float f = fract(coord / 6.2831853);
            float val = f * 1.35; 
            shaderColor[j] += lineWidth * float(i*i) / (val + 0.018);
          }
        }
        
        // Blend background and letter colors smoothly based on blurred mask alpha
        vec3 finalColor = mix(baseColor, letterColor, a_blur);
        // Add the glowing mirror lines ONLY along the edge of the letter
        finalColor += shaderColor * 0.40 * edge;
        
        gl_FragColor = vec4(finalColor, 1.0);
      }
    `;

    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Full screen quad geometry
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Set uniforms
    const resLocation = gl.getUniformLocation(program, "resolution");
    gl.uniform2f(resLocation, canvas.width, canvas.height);

    const timeLocation = gl.getUniformLocation(program, "time");
    gl.uniform1f(timeLocation, seedTime * 500.0);

    const baseColorLocation = gl.getUniformLocation(program, "baseColor");
    gl.uniform3f(baseColorLocation, baseRGB[0] / 255, baseRGB[1] / 255, baseRGB[2] / 255);

    const letterColorLocation = gl.getUniformLocation(program, "letterColor");
    gl.uniform3f(letterColorLocation, letterRGB[0] / 255, letterRGB[1] / 255, letterRGB[2] / 255);

    // Upload and bind texture
    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, letterCanvas);

    const textureLocation = gl.getUniformLocation(program, "letterTexture");
    gl.uniform1i(textureLocation, 0);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Clean up WebGL resources
    gl.deleteTexture(texture);
    gl.deleteBuffer(buffer);
    gl.deleteProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
  }

  // Draw matte texture / border using 2D canvas context overlay
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = width;
  finalCanvas.height = height;
  const ctx = finalCanvas.getContext("2d");
  if (ctx) {
    ctx.drawImage(canvas, 0, 0);

    // Subtle paper-like matte noise
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (random() - 0.5) * 8;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    // Subtle inner border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0, 0, width, height);
  }

  const dataUrl = finalCanvas.toDataURL("image/jpeg", 0.94);
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
