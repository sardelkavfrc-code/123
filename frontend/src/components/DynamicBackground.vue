<script setup lang="ts">
import { ref, watch } from "vue";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { getFallbackColors } from "@/utils/color";

const player = usePlayerStore();
const settings = useSettingsStore();

const layer1Style = ref<string>("none");
const layer2Style = ref<string>("none");
const activeLayer = ref(1);

let sequenceId = 0;

const getFallbackGradient = (trackId: number | string) => {
  const c = getFallbackColors(trackId);
  return `
    radial-gradient(circle at 20% 20%, ${c[0]} 0%, transparent 60%),
    radial-gradient(circle at 80% 80%, ${c[1]} 0%, transparent 60%),
    radial-gradient(circle at 50% 50%, ${c[2]} 0%, transparent 70%)
  `;
};

const updateBackground = async () => {
  if (settings.theme !== "spotify") return;
  
  const currentSeq = ++sequenceId;
  const track = player.current;
  let bgStyle: string;
  
  if (track) {
    if (track.album_cover) {
      bgStyle = `url("${track.album_cover}")`;
    } else {
      bgStyle = getFallbackGradient(track.id);
    }
  } else {
    bgStyle = "none";
  }

  // Stop if a newer track switch happened
  if (currentSeq !== sequenceId) return;

  if (activeLayer.value === 1) {
    layer2Style.value = bgStyle;
    activeLayer.value = 2;
  } else {
    layer1Style.value = bgStyle;
    activeLayer.value = 1;
  }
};

watch(() => player.current?.id, updateBackground, { immediate: true });
watch(() => settings.theme, (theme) => {
  if (theme === "spotify") {
    updateBackground();
  }
});
</script>

<template>
  <div class="dynamic-bg" v-if="settings.theme === 'spotify'">
    <div 
      class="dynamic-bg__layer" 
      :class="{ 'dynamic-bg__layer--active': activeLayer === 1 }"
      :style="{ backgroundImage: layer1Style }"
    ></div>
    <div 
      class="dynamic-bg__layer" 
      :class="{ 'dynamic-bg__layer--active': activeLayer === 2 }"
      :style="{ backgroundImage: layer2Style }"
    ></div>
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
  opacity: 0;
  transition: opacity 1.5s cubic-bezier(0.4, 0, 0.2, 1);
  /* The blur gives it that smooth Spotify/Apple Music glassmorphism vibe */
  filter: blur(90px) saturate(1.4);
  transform: translateZ(0); /* hardware acceleration */
  will-change: opacity;
  background-size: cover;
  background-position: center;
}

.dynamic-bg__layer--active {
  opacity: 1;
}

.dynamic-bg__overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5); /* darkened slightly for white text */
  pointer-events: none;
}
</style>
