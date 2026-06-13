<script setup lang="ts">
import { ref, watch } from "vue";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { extractColors, getFallbackColors } from "@/utils/color";

const player = usePlayerStore();
const settings = useSettingsStore();

const activeLayers = ref<{ id: number; style: string }[]>([]);
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
  if (settings.theme !== "spotify" && settings.theme !== "spotify-cover") return;
  
  const track = player.current;
  let bgStyle: string;
  
  if (track) {
    if (track.album_cover) {
      if (settings.theme === "spotify-cover") {
        bgStyle = `url("${track.album_cover}")`;
      } else {
        const colors = await extractColors(track.album_cover);
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

  // Prevent adding the exact same background if it hasn't changed
  if (activeLayers.value.length > 0 && activeLayers.value[0].style === bgStyle) {
    return;
  }

  activeLayers.value = [{ id: ++layerId, style: bgStyle }];
};

watch(() => player.current?.id, updateBackground, { immediate: true });
watch(() => settings.theme, (theme) => {
  if (theme === "spotify" || theme === "spotify-cover") {
    updateBackground();
  } else {
    activeLayers.value = [];
  }
});
</script>

<template>
  <div class="dynamic-bg" v-if="settings.theme === 'spotify' || settings.theme === 'spotify-cover'">
    <TransitionGroup name="bg-fade">
      <div 
        v-for="layer in activeLayers"
        :key="layer.id"
        class="dynamic-bg__layer"
        :style="{ backgroundImage: layer.style }"
      ></div>
    </TransitionGroup>
    <!-- Dark overlay to ensure text readability -->
    <div class="dynamic-bg__overlay"></div>
  </div>
</template>

<style scoped>
.dynamic-bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background-color: #0b0c10;
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
