<script setup lang="ts">
import { ref, watch } from "vue";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { extractColors, getFallbackColors } from "@/utils/color";

const player = usePlayerStore();
const settings = useSettingsStore();

const layer1Colors = ref<string[]>(["#121212", "#181818", "#1a1a1a"]);
const layer2Colors = ref<string[]>(["#121212", "#181818", "#1a1a1a"]);
const activeLayer = ref(1);

let sequenceId = 0;

const updateBackground = async () => {
  if (settings.theme !== "spotify") return;
  
  const currentSeq = ++sequenceId;
  const track = player.current;
  let newColors: string[];
  
  if (track) {
    if (track.album_cover) {
      newColors = await extractColors(track.album_cover);
    } else {
      newColors = getFallbackColors(track.id);
    }
  } else {
    newColors = ["#121212", "#181818", "#1a1a1a"];
  }

  // Stop if a newer track switch happened while we were extracting colors
  if (currentSeq !== sequenceId) return;

  if (activeLayer.value === 1) {
    layer2Colors.value = newColors;
    activeLayer.value = 2;
  } else {
    layer1Colors.value = newColors;
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
      :style="{
        backgroundImage: `
          radial-gradient(circle at 20% 20%, ${layer1Colors[0]} 0%, transparent 60%),
          radial-gradient(circle at 80% 80%, ${layer1Colors[1]} 0%, transparent 60%),
          radial-gradient(circle at 50% 50%, ${layer1Colors[2]} 0%, transparent 70%)
        `
      }"
    ></div>
    <div 
      class="dynamic-bg__layer" 
      :class="{ 'dynamic-bg__layer--active': activeLayer === 2 }"
      :style="{
        backgroundImage: `
          radial-gradient(circle at 20% 20%, ${layer2Colors[0]} 0%, transparent 60%),
          radial-gradient(circle at 80% 80%, ${layer2Colors[1]} 0%, transparent 60%),
          radial-gradient(circle at 50% 50%, ${layer2Colors[2]} 0%, transparent 70%)
        `
      }"
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
  inset: -20%; /* extend slightly beyond edges to cover blur artifacts */
  width: 140%;
  height: 140%;
  opacity: 0;
  transition: opacity 1.5s cubic-bezier(0.4, 0, 0.2, 1);
  /* The blur gives it that smooth Spotify/Apple Music glassmorphism vibe */
  filter: blur(90px) saturate(1.4);
  transform: translateZ(0); /* hardware acceleration */
  will-change: opacity;
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
