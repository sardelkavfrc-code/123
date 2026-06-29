<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  src: string | null;
}>();

const isLoaded = ref(false);

watch(
  () => props.src,
  (newSrc) => {
    if (!newSrc) {
      isLoaded.value = false;
      return;
    }
    // Instantly reset loaded state so it fades out
    isLoaded.value = false;

    const img = new Image();
    img.src = newSrc;
    img.decode()
      .then(() => {
        // Only set to true if the src hasn't changed while we were decoding
        if (props.src === newSrc) {
          isLoaded.value = true;
        }
      })
      .catch(() => {
        // Even on error, we might want to try to show it or at least let CSS handle the broken state
        if (props.src === newSrc) {
          isLoaded.value = true;
        }
      });
  },
  { immediate: true }
);
</script>

<template>
  <div class="player-cover">
    <span class="player-cover__fallback accent-gradient" />
    <div
      class="player-cover__img"
      :class="{ 'player-cover__img--loaded': isLoaded }"
      :style="props.src ? { backgroundImage: `url(${props.src})` } : {}"
    />
  </div>
</template>

<style scoped>
.player-cover {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
  background-color: var(--bg-2);
}
.player-cover__fallback {
  position: absolute;
  inset: 0;
  display: block;
}
.player-cover__img {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0;
  transition: opacity 0.35s ease;
}
.player-cover__img--loaded {
  opacity: 1;
}
</style>
