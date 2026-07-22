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
  isSelectMode?: boolean;
  selectedTracks?: Set<string>;
}>();

const emit = defineEmits<{
  (e: "play", track: Track, index: number): void;
  (e: "toggle-select", track: Track): void;
  (e: "context-menu-selected", event: MouseEvent): void;
}>();

const player = usePlayerStore();

const containerRef = ref<any>(null);
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
  const counts: Record<string, number> = {};
  for (let i = startIdx; i <= endIdx; i++) {
    const track = props.tracks[i];
    const baseKey = `${track.owner_id}_${track.id}`;
    counts[baseKey] = (counts[baseKey] || 0) + 1;
    // Add count suffix only for duplicates to ensure unique keys
    const key = counts[baseKey] === 1 ? baseKey : `${baseKey}_${counts[baseKey]}`;
    
    result.push({
      track,
      index: i,
      offsetTop: i * h,
      key
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
  const el = containerRef.value?.$el || containerRef.value;
  if (scrollParent && el) {
    const parentRect = scrollParent.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();
    // offsetTop of container relative to scrollParent's client area (accounting for current scroll)
    const offsetInParent = containerRect.top - parentRect.top + scrollParent.scrollTop;
    
    scrollTop.value = Math.max(0, scrollParent.scrollTop - offsetInParent);
  } else if (scrollParent) {
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
  
  const el = containerRef.value?.$el || containerRef.value;
  if (el) {
    scrollParent = getScrollParent(el.parentElement);
    if (!scrollParent) {
      scrollParent = document.documentElement;
    }
    
    if (scrollParent) {
      scrollParent.addEventListener("scroll", handleScroll, { passive: true });
      handleScroll();
      if (scrollParent.clientHeight > 0) {
        clientHeight.value = scrollParent.clientHeight;
      }
    }
  }
}

let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  setTimeout(updateScrollParent, 50);
  window.addEventListener("resize", handleResize, { passive: true });
  
  // Observe the container so we can recalculate when it becomes visible or resizes
  // (e.g. on theme changes or tab switches)
  resizeObserver = new ResizeObserver(() => {
    if (clientHeight.value === 0 || clientHeight.value === 800) {
      updateScrollParent();
    } else {
      handleResize();
    }
  });
  
  const el = containerRef.value?.$el || containerRef.value;
  if (el) {
    resizeObserver.observe(el);
    if (el.parentElement) {
      resizeObserver.observe(el.parentElement);
    }
  }
});

onBeforeUnmount(() => {
  if (scrollParent) {
    scrollParent.removeEventListener("scroll", handleScroll);
  }
  window.removeEventListener("resize", handleResize);
  
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});

watch(() => props.tracks, () => {
  setTimeout(handleScroll, 10);
}, { deep: false });
</script>

<template>
  <TransitionGroup 
    v-if="tracks.length" 
    name="track-list" 
    tag="div" 
    ref="containerRef" 
    class="track-list" 
    :style="{ height: `${totalHeight}px` }"
  >
    <TrackRow
      v-for="item in visibleItems"
      :key="item.key"
      :track="item.track"
      :index="item.index"
      :show-index="showIndex"
      :variant="variant"
      :is-select-mode="isSelectMode"
      :is-selected="selectedTracks?.has(`${item.track.owner_id}_${item.track.id}`)"
      class="track-list__row"
      :style="{ position: 'absolute', top: 0, left: 0, right: 0, height: `${rowHeight}px`, transform: `translateY(${item.offsetTop}px)`, transition: 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.4s ease, scale 0.4s cubic-bezier(0.32, 0.72, 0, 1)' }"
      @play="() => playAll(indexInPlayable(item.track))"
      @toggle-select="emit('toggle-select', item.track)"
      @context-menu-selected="emit('context-menu-selected', $event)"
    />
  </TransitionGroup>
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
.track-list__row {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}
.track-list-enter-active,
.track-list-leave-active {
  pointer-events: none;
}
.track-list-enter-from,
.track-list-leave-to {
  opacity: 0;
  scale: 0.92;
}
.track-list-leave-active {
  z-index: -1;
}
</style>
