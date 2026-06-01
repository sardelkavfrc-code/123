<script setup lang="ts">
import { computed, ref, onMounted, onActivated, nextTick, watch } from "vue";
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

const draggableQueue = computed({
  get: () => queue.value,
  set: (val: Track[]) => {
    isSettingQueue = true;
    player.setQueue(val);
    setTimeout(() => { isSettingQueue = false; }, 100);
  }
});

const listRef = ref<HTMLElement | null>(null);
const loaderRef = ref<HTMLElement | null>(null);

useIntersectionObserver(loaderRef, ([entry]) => {
  if (entry.isIntersecting) {
    player.loadMoreQueue();
  }
});

function scrollToCurrent() {
  if (!listRef.value) return false;
  const currentEl = listRef.value.querySelector('.queue__row--current') as HTMLElement | null;
  if (currentEl) {
    const container = currentEl.closest('.scroll-area') as HTMLElement | null;
    if (container) {
      const cRect = container.getBoundingClientRect();
      const eRect = currentEl.getBoundingClientRect();
      const top = container.scrollTop + (eRect.top - cRect.top) - container.clientHeight / 2 + eRect.height / 2;
      container.scrollTo({ top, behavior: 'smooth' });
    } else {
      currentEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    return true;
  }
  return false;
}

const total = computed(() => queue.value.reduce((acc, t) => acc + (t.duration || 0), 0));

function initScroll() {
  if (!settings.autoScrollQueue) return;
  // wait for transition and layout
  setTimeout(() => {
    if (!settings.autoScrollQueue) return;
    scrollToCurrent();
  }, 300);
}

onMounted(initScroll);
onActivated(initScroll);

watch(index, () => {
  if (!settings.autoScrollQueue || isSettingQueue) return;
  nextTick(() => {
    scrollToCurrent();
  });
});

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
        v-model="draggableQueue"
        item-key="id"
        tag="ol"
        class="queue__list"
        ghost-class="queue__row-wrap--ghost"
        drag-class="queue__row-wrap--dragging"
        fallback-class="queue__row-wrap--dragging"
        :force-fallback="true"
        :fallback-on-body="true"
        :animation="250"
      >
        <template #item="{ element: track, index: i }">
          <div class="queue__row-wrap" @dblclick="playAt(i)">
            <QueueRow
              :track="track"
              :index="i"
              :current="i === index"
              :playing="i === index && isPlaying"
              @play="playAt"
              @remove="remove"
            />
          </div>
        </template>
        <template #footer>
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
:deep(.queue__row) {
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
