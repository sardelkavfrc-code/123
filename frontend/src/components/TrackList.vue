<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount, watch } from "vue";
import TrackRow from "./TrackRow.vue";
import EmptyState from "./EmptyState.vue";
import { usePlayerStore } from "@/stores/player";
import type { Track } from "@/api/types";

const props = defineProps<{
  tracks: Track[];
  showIndex?: boolean;
  variant?: "default" | "compact";
  emptyTitle?: string;
  emptySubtitle?: string;
  manualPlay?: boolean;
}>();

const emit = defineEmits<{
  (e: "play", track: Track, index: number): void;
}>();

const player = usePlayerStore();

const containerRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const clientHeight = ref(window.innerHeight || 800); // fallback default height
 
const rowHeight = computed(() => (props.variant === "compact" ? 48 : 60));
const totalHeight = computed(() => props.tracks.length * rowHeight.value);

const visibleItems = computed(() => {
  const h = rowHeight.value;
  const len = props.tracks.length;
  if (len === 0) return [];
  
  // Calculate start and end indices with buffer
  const startIdx = Math.max(0, Math.floor(scrollTop.value / h) - 5);
  const endIdx = Math.min(len - 1, Math.ceil((scrollTop.value + clientHeight.value) / h) + 5);
  
  const result = [];
  for (let i = startIdx; i <= endIdx; i++) {
    result.push({
      track: props.tracks[i],
      index: i,
      offsetTop: i * h,
      key: `${props.tracks[i].owner_id}_${props.tracks[i].id}_${i}`
    });
  }
  return result;
});

const playableTracks = computed(() => props.tracks.filter((t) => t.url));

function playAll(startIndex: number) {
  if (playableTracks.value.length === 0) return;
  if (props.manualPlay) {
    const track = playableTracks.value[startIndex];
    emit("play", track, startIndex);
  } else {
    player.playQueue(playableTracks.value, startIndex);
  }
}

function indexInPlayable(track: Track): number {
  return playableTracks.value.findIndex((t) => t.id === track.id && t.owner_id === track.owner_id);
}

// Track scroll parent
let scrollParent: HTMLElement | null = null;

function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  if (node == null) return null;
  const style = window.getComputedStyle(node);
  const overflowY = style.overflowY;
  const isScrollable = overflowY === "auto" || overflowY === "scroll";
  
  if (isScrollable) {
    return node;
  }
  return getScrollParent(node.parentElement);
}

function handleScroll() {
  if (scrollParent) {
    scrollTop.value = scrollParent.scrollTop;
  }
}

function handleResize() {
  handleScroll();
  if (scrollParent && scrollParent.clientHeight > 0) {
    clientHeight.value = scrollParent.clientHeight;
  }
}

function updateScrollParent() {
  if (scrollParent) {
    scrollParent.removeEventListener("scroll", handleScroll);
  }
  
  if (containerRef.value) {
    scrollParent = getScrollParent(containerRef.value.parentElement);
    if (!scrollParent) {
      scrollParent = document.documentElement;
    }
    
    if (scrollParent) {
      scrollParent.addEventListener("scroll", handleScroll, { passive: true });
      scrollTop.value = scrollParent.scrollTop;
      if (scrollParent.clientHeight > 0) {
        clientHeight.value = scrollParent.clientHeight;
      }
    }
  }
}

onMounted(() => {
  setTimeout(updateScrollParent, 50);
  window.addEventListener("resize", handleResize, { passive: true });
});

onBeforeUnmount(() => {
  if (scrollParent) {
    scrollParent.removeEventListener("scroll", handleScroll);
  }
  window.removeEventListener("resize", handleResize);
});

watch(() => props.tracks, () => {
  setTimeout(handleScroll, 10);
}, { deep: false });
</script>

<template>
  <div v-if="tracks.length" ref="containerRef" class="track-list" :style="{ height: `${totalHeight}px` }">
    <div
      v-for="item in visibleItems"
      :key="item.key"
      class="track-list__item"
      :style="{
        transform: `translateY(${item.offsetTop}px)`,
        height: `${rowHeight}px`
      }"
    >
      <TrackRow
        :track="item.track"
        :index="item.index"
        :show-index="showIndex"
        :variant="variant"
        @play="playAll(Math.max(0, indexInPlayable(item.track)))"
      />
    </div>
  </div>
  <EmptyState
    v-else
    :title="emptyTitle ?? 'Пусто'"
    :subtitle="emptySubtitle ?? 'Здесь пока ничего нет'"
  />
</template>

<style scoped>
.track-list {
  position: relative;
  width: 100%;
}
.track-list__item {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
</style>
