<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, onActivated } from "vue";

const emit = defineEmits<{
  reachEnd: [];
}>();

const props = defineProps<{
  /** Distance from the bottom (in px) at which `reachEnd` fires. */
  endThreshold?: number;
}>();

const root = ref<HTMLDivElement | null>(null);
const savedScrollTop = ref(0);

// Throttle reach-end emissions so we don't spam the parent on every scroll
// tick — once per animation frame is plenty.
let rafHandle: number | null = null;

function onScroll() {
  if (!root.value) return;
  savedScrollTop.value = root.value.scrollTop;
  if (rafHandle !== null) return;
  rafHandle = window.requestAnimationFrame(() => {
    rafHandle = null;
    if (!root.value) return;
    const threshold = props.endThreshold ?? 320;
    const { scrollTop, clientHeight, scrollHeight } = root.value;
    if (scrollHeight - (scrollTop + clientHeight) <= threshold) {
      emit("reachEnd");
    }
  });
}

onMounted(() => {
  root.value?.addEventListener("scroll", onScroll, { passive: true });
});
onBeforeUnmount(() => {
  root.value?.removeEventListener("scroll", onScroll);
  if (rafHandle !== null) window.cancelAnimationFrame(rafHandle);
});

onActivated(() => {
  if (root.value && savedScrollTop.value > 0) {
    root.value.scrollTop = savedScrollTop.value;
  }
});
</script>

<template>
  <div ref="root" class="scroll-area">
    <slot />
  </div>
</template>

<style scoped>
.scroll-area {
  height: 100%;
  width: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 24px;
}
</style>
