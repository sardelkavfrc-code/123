<script setup lang="ts">
import { computed, ref, onMounted, onActivated, nextTick, watch, onBeforeUnmount } from "vue";
import { storeToRefs } from "pinia";
import { usePlayerStore } from "@/stores/player";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import EmptyState from "@/components/EmptyState.vue";
import QueueRow from "@/components/QueueRow.vue";
import { formatDuration } from "@/composables/useFormat";
import { useIntersectionObserver } from "@vueuse/core";
import Spinner from "@/components/Spinner.vue";
import draggable from "vuedraggable";
import type { Track } from "@/api/types";

import { useSettingsStore } from "@/stores/settings";

const player = usePlayerStore();
const settings = useSettingsStore();
const { queue, index, isPlaying } = storeToRefs(player);

let isSettingQueue = false;

const listRef = ref<HTMLElement | null>(null);
const loaderRef = ref<HTMLElement | null>(null);

// Scroll position state for spacer-based virtual scrolling
const scrollTop = ref(0);
const clientHeight = ref(window.innerHeight || 800);

const rowHeight = 64; // 60px height + 4px gap

// Calculate visible item window with buffers
const startIdx = computed(() => {
  return Math.max(0, Math.floor(scrollTop.value / rowHeight) - 15);
});
const endIdx = computed(() => {
  return Math.min(queue.value.length, Math.ceil((scrollTop.value + clientHeight.value) / rowHeight) + 25);
});

const topSpacerHeight = computed(() => startIdx.value * rowHeight);
const bottomSpacerHeight = computed(() => (queue.value.length - endIdx.value) * rowHeight);

const visibleQueue = computed(() => {
  return queue.value.slice(startIdx.value, endIdx.value);
});

const draggableQueue = computed({
  get: () => visibleQueue.value,
  set: (val: Track[]) => {
    isSettingQueue = true;
    const before = queue.value.slice(0, startIdx.value);
    const after = queue.value.slice(endIdx.value);
    const newFullQueue = [...before, ...val, ...after];
    player.setQueue(newFullQueue, true);
    setTimeout(() => { isSettingQueue = false; }, 100);
  }
});

useIntersectionObserver(loaderRef, ([entry]) => {
  if (entry.isIntersecting) {
    player.loadMoreQueue();
  }
});

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
  
  if (listRef.value) {
    scrollParent = getScrollParent(listRef.value.parentElement);
  }
  
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

function scrollToCurrent() {
  if (scrollParent && index.value >= 0) {
    const listOffsetTop = listRef.value ? listRef.value.offsetTop : 160;
    const top = listOffsetTop + index.value * rowHeight - scrollParent.clientHeight / 2 + rowHeight / 2;
    scrollParent.scrollTo({ top, behavior: 'smooth' });
    return true;
  }
  return false;
}

const total = computed(() => queue.value.reduce((acc, t) => acc + (t.duration || 0), 0));

function initScroll() {
  if (!settings.autoScrollQueue) return;
  setTimeout(() => {
    if (!settings.autoScrollQueue) return;
    scrollToCurrent();
  }, 300);
}

onMounted(() => {
  setTimeout(updateScrollParent, 50);
  window.addEventListener("resize", handleResize, { passive: true });
  initScroll();
});

onActivated(initScroll);

onBeforeUnmount(() => {
  if (scrollParent) {
    scrollParent.removeEventListener("scroll", handleScroll);
  }
  window.removeEventListener("resize", handleResize);
});

watch(index, () => {
  if (!settings.autoScrollQueue || isSettingQueue) return;
  nextTick(() => {
    scrollToCurrent();
  });
});

watch(queue, () => {
  setTimeout(() => {
    handleScroll();
    updateScrollParent();
  }, 50);
}, { deep: false });

function playAt(i: number) {
  if (i === index.value) {
    player.togglePlay();
    return;
  }
  player.playAtIndex(i);
}

function remove(i: number) {
  player.removeFromQueue(i);
}
</script>

<template>
  <ScrollArea>
    <PageHeader
      eyebrow="Очередь"
      title="Сейчас в очереди"
      :subtitle="
        queue.length
          ? `${queue.length} треков · ${formatDuration(total)} · перетягивай, чтобы менять порядок`
          : 'Запусти любой трек — он окажется здесь'
      "
    >
    </PageHeader>

    <section class="queue" ref="listRef" @wheel.stop>
      <EmptyState
        v-if="!queue.length"
        title="Очередь пуста"
        subtitle="Откуда угодно нажми Play — добавится сюда. Можно перетягивать и удалять"
      />
      <draggable
        v-else
        v-model="draggableQueue"
        item-key="id"
        tag="ol"
        class="queue__list"
        ghost-class="queue__row-wrap--ghost"
        drag-class="queue__row-wrap--dragging"
        fallback-class="queue__row-wrap--dragging"
        :force-fallback="false"
        :fallback-on-body="false"
        :animation="250"
      >
        <template #header>
          <li :style="{ height: `${topSpacerHeight}px` }" class="queue__spacer" key="top-spacer"></li>
        </template>
        
        <template #item="{ element: track, index: i }">
          <div class="queue__row-wrap" @dblclick="playAt(i + startIdx)">
            <QueueRow
              :track="track"
              :index="i + startIdx"
              :current="(i + startIdx) === index"
              :playing="(i + startIdx) === index && isPlaying"
              @play="playAt"
              @remove="remove"
            />
          </div>
        </template>
        
        <template #footer>
          <li :style="{ height: `${bottomSpacerHeight}px` }" class="queue__spacer" key="bottom-spacer"></li>
          <div ref="loaderRef" class="queue__loader" key="loader">
            <Spinner v-if="player.loadingMore" :size="24" color="var(--accent-1)" />
          </div>
        </template>
      </draggable>
    </section>
  </ScrollArea>
</template>

<style scoped>
.queue {
  padding: 0 32px 24px;
}
.queue__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.queue__row-wrap {
  position: relative;
  width: 100%;
  content-visibility: auto;
  contain-intrinsic-size: auto 62px;
}
.queue__row-wrap--dragging {
  opacity: 1 !important;
  z-index: 100;
}
.queue__row-wrap--ghost {
  opacity: 0.2;
}
.queue__row-wrap--ghost :deep(.queue__row) {
  background: var(--bg-2);
}
.queue__spacer {
  list-style: none;
  padding: 0;
  margin: 0;
  pointer-events: none;
}
:deep(.queue__row) {
  list-style: none;
  position: relative;
  display: grid;
  grid-template-columns: 20px 28px 48px 1fr auto auto 40px;
  align-items: center;
  gap: 14px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  cursor: grab;
  background: transparent;
  transition:
    background var(--motion-duration-fast) var(--motion-ease-out),
    transform var(--motion-duration-fast) var(--motion-ease-out);
}
:deep(.queue__row:hover) {
  background: var(--bg-2);
}
:deep(.queue__row--current) {
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent-1) 12%, transparent), color-mix(in srgb, var(--accent-3) 12%, transparent));
  color: var(--text-0);
}
:deep(.queue__handle) {
  display: inline-flex;
  color: var(--text-3);
  cursor: grab;
}
:deep(.queue__row:active .queue__handle) {
  cursor: grabbing;
}
:deep(.queue__index) {
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--text-3);
  font-size: 12px;
}
:deep(.queue__row--current .queue__index) {
  color: var(--accent-1);
}
:deep(.queue__cover) {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-3);
  background-size: cover;
  background-position: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
:deep(.queue__cover-stub) {
  font-weight: 700;
  color: var(--text-2);
}
:deep(.queue__meta) {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
:deep(.queue__title) {
  font-weight: 600;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  background: none;
  padding: 0;
  border: none;
  width: 100%;
}
:deep(.queue__artist) {
  color: var(--text-2);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  background: none;
  padding: 0;
  border: none;
  cursor: pointer;
}
:deep(.queue__artist:hover) {
  color: var(--text-0);
}
:deep(.queue__duration) {
  color: var(--text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
:deep(.queue__actions) {
  display: inline-flex;
  gap: 4px;
  opacity: 0;
  transition: opacity var(--motion-duration-fast) var(--motion-ease-out);
}
:deep(.queue__row:hover .queue__actions) {
  opacity: 1;
}
:deep(.queue__action) {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  transition:
    background var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
}
:deep(.queue__action:hover) {
  background: var(--bg-3);
  color: var(--text-0);
}
:deep(.queue__remove) {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  opacity: 0;
  transition:
    opacity var(--motion-duration-fast) var(--motion-ease-out),
    background var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
}
:deep(.queue__row:hover .queue__remove) {
  opacity: 1;
}
:deep(.queue__remove:hover) {
  background: rgba(255, 94, 126, 0.16);
  color: var(--danger);
}
.queue__loader {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
