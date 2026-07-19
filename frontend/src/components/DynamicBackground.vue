<script setup lang="ts">
import { ref, watch } from "vue";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { extractColors, getFallbackColors } from "@/utils/color";

const player = usePlayerStore();
const settings = useSettingsStore();

interface BackgroundLayer {
  id: number;
  style: string;
  isCustom: boolean;
  blur: number;
  zoom: number;
  posX: number;
  posY: number;
  brightness: number;
}

const activeLayers = ref<BackgroundLayer[]>([]);
let layerId = 0;

const getFallbackGradient = (trackId: number | string) => {
  const c = getFallbackColors(trackId);
  return `
    radial-gradient(circle at 20% 20%, ${c[0]} 0%, transparent 60%),
    radial-gradient(circle at 80% 80%, ${c[1]} 0%, transparent 60%),
    radial-gradient(circle at 50% 50%, ${c[2]} 0%, transparent 70%)
  `;
};

const updateBackground = async () => {
  let bgStyle: string;
  let isCustom = false;
  let layerBlur = 90;
  let layerZoom = 1.0;
  let layerPosX = 50;
  let layerPosY = 50;
  let layerBrightness = 100;

  if (settings.customBgEnabled) {
    isCustom = true;
    if (settings.customBgCachedUrl) {
      bgStyle = `url("${settings.customBgCachedUrl}")`;
    } else if (settings.customBgUrl) {
      bgStyle = `url("${settings.customBgUrl}")`;
    } else {
      bgStyle = "none";
    }
    layerBlur = settings.customBgBlur;
    layerZoom = settings.customBgZoom;
    layerPosX = settings.customBgPosX;
    layerPosY = settings.customBgPosY;
    layerBrightness = settings.customBgBrightness;
  } else {
    if (settings.theme !== "spotify" && settings.theme !== "spotify-cover") {
      activeLayers.value = [];
      return;
    }
    
    const track = player.current;
    if (track) {
      const cover = track.cover_large || track.cover_medium || track.cover_small;
      if (cover) {
        if (settings.theme === "spotify-cover") {
          bgStyle = `url("${cover}")`;
        } else {
          const colors = await extractColors(cover);
          bgStyle = `
            radial-gradient(circle at 20% 20%, ${colors[0]} 0%, transparent 60%),
            radial-gradient(circle at 80% 80%, ${colors[1]} 0%, transparent 60%),
            radial-gradient(circle at 50% 50%, ${colors[2]} 0%, transparent 70%)
          `;
        }
      } else {
        bgStyle = getFallbackGradient(track.id);
      }
    } else {
      bgStyle = "none";
    }
    layerBlur = settings.theme === "spotify-cover" ? settings.coverBgBlur : 90;
  }

  // Prevent adding the exact same background if it hasn't changed
  if (activeLayers.value.length > 0 && activeLayers.value[0].style === bgStyle) {
    const currentLayer = activeLayers.value[0];
    currentLayer.isCustom = isCustom;
    currentLayer.blur = layerBlur;
    currentLayer.zoom = layerZoom;
    currentLayer.posX = layerPosX;
    currentLayer.posY = layerPosY;
    currentLayer.brightness = layerBrightness;
    return;
  }

  // Preload image to avoid visual stutter (skip for local blob URLs to render instantly)
  if (bgStyle && bgStyle.startsWith('url("') && bgStyle.endsWith('")')) {
    const url = bgStyle.slice(5, -2);
    if (!url.startsWith('blob:')) {
      try {
        await new Promise<void>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = url;
        });
      } catch (err) {
        console.warn("Failed to preload background image:", url, err);
      }
    }
  }

  activeLayers.value = [{
    id: ++layerId,
    style: bgStyle,
    isCustom,
    blur: layerBlur,
    zoom: layerZoom,
    posX: layerPosX,
    posY: layerPosY,
    brightness: layerBrightness
  }];
};

const getLayerStyle = (layer: BackgroundLayer) => {
  if (!layer.isCustom) {
    return {
      backgroundImage: layer.style,
      filter: `blur(${layer.blur}px) saturate(1.4)`,
      transform: 'scale(1.1) translateZ(0)',
      backgroundPosition: 'center'
    };
  }

  const zoom = layer.zoom;
  const posX = layer.posX;
  const posY = layer.posY;
  const blur = layer.blur;
  const brightness = layer.brightness;

  const dx = zoom > 1 ? ((50 - posX) * (zoom - 1)) / zoom : 0;
  const dy = zoom > 1 ? ((50 - posY) * (zoom - 1)) / zoom : 0;

  return {
    backgroundImage: layer.style,
    filter: `blur(${blur}px) saturate(1.4) brightness(${brightness / 100})`,
    transform: `scale(${zoom}) translate(${dx}%, ${dy}%) translateZ(0)`,
    backgroundPosition: `${posX}% ${posY}%`
  };
};

watch(() => player.current?.id, updateBackground, { immediate: true });
watch(
  () => [
    settings.theme,
    settings.customBgEnabled,
    settings.customBgUrl,
    settings.customBgCachedUrl,
    settings.customBgBlur,
    settings.customBgZoom,
    settings.customBgPosX,
    settings.customBgPosY,
    settings.customBgBrightness,
    settings.coverBgBlur
  ],
  () => {
    updateBackground();
  }
);
</script>

<template>
  <Transition name="theme-bg">
    <div class="dynamic-bg" v-if="settings.customBgEnabled || settings.theme === 'spotify' || settings.theme === 'spotify-cover'">
      <TransitionGroup name="bg-fade">
        <div 
          v-for="layer in activeLayers"
          :key="layer.id"
          :class="['dynamic-bg__layer', { 'dynamic-bg__layer--custom': layer.isCustom }]"
          :style="getLayerStyle(layer)"
        ></div>
      </TransitionGroup>
      <!-- Dark overlay to ensure text readability -->
      <Transition name="theme-bg">
        <div class="dynamic-bg__overlay" v-if="!settings.customBgEnabled"></div>
      </Transition>
    </div>
  </Transition>
</template>

<style scoped>
.dynamic-bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background-color: transparent;
}

.dynamic-bg__layer {
  position: absolute;
  inset: -100px; /* extend by fixed pixels to cover blur artifacts without excessive zooming */
  width: calc(100% + 200px);
  height: calc(100% + 200px);
  /* The blur gives it that smooth Spotify/Apple Music glassmorphism vibe */
  filter: blur(90px) saturate(1.4);
  transform: translateZ(0); /* hardware acceleration */
  will-change: opacity;
  background-size: cover;
  background-position: center;
}

.dynamic-bg__layer--custom {
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
}

.theme-bg-enter-active,
.theme-bg-leave-active {
  transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.theme-bg-enter-from,
.theme-bg-leave-to {
  opacity: 0;
}

.bg-fade-enter-active,
.bg-fade-leave-active {
  transition: opacity 1.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.bg-fade-enter-from,
.bg-fade-leave-to {
  opacity: 0;
}

.dynamic-bg__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5); /* darkened slightly for white text */
  pointer-events: none;
}
</style>
