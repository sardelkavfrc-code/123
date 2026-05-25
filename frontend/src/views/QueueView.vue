<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { usePlayerStore } from "@/stores/player";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import EmptyState from "@/components/EmptyState.vue";
import QueueRow from "@/components/QueueRow.vue";
import { formatDuration } from "@/composables/useFormat";

const player = usePlayerStore();
const { queue, index, isPlaying } = storeToRefs(player);

const dragIndex = ref<number | null>(null);
const dropTarget = ref<number | null>(null);

const total = computed(() => queue.value.reduce((acc, t) => acc + (t.duration || 0), 0));

function onDragStart(i: number, event: DragEvent) {
  dragIndex.value = i;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    // Firefox refuses to fire dragover unless dataTransfer has data set.
    event.dataTransfer.setData("text/plain", String(i));
  }
}

function onDragOver(i: number, event: DragEvent) {
  if (dragIndex.value === null) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  dropTarget.value = i;
}

function onDrop(i: number, event: DragEvent) {
  event.preventDefault();
  if (dragIndex.value === null || dragIndex.value === i) {
    dragIndex.value = null;
    dropTarget.value = null;
    return;
  }
  player.moveInQueue(dragIndex.value, i);
  dragIndex.value = null;
  dropTarget.value = null;
}

function onDragEnd() {
  dragIndex.value = null;
  dropTarget.value = null;
}

function playAt(i: number) {
  if (i === index.value) {
    player.togglePlay();
    return;
  }
  player.index = i;
  // Reload the backend for the freshly-pointed-at track.
  player.playQueue(queue.value, i);
}

function remove(i: number) {
  player.removeFromQueue(i);
}

function clearQueue() {
  player.clear();
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
      <template v-if="queue.length" #actions>
        <button class="btn btn--ghost" @click="clearQueue">Очистить очередь</button>
      </template>
    </PageHeader>

    <section class="queue">
      <EmptyState
        v-if="!queue.length"
        title="Очередь пуста"
        subtitle="Откуда угодно нажми Play — добавится сюда. Можно перетягивать и удалять"
      />
      <ol v-else class="queue__list">
        <div
          v-for="(track, i) in queue"
          :key="`${track.owner_id}_${track.id}_${i}`"
          class="queue__row-wrap"
          :class="{
            'queue__row-wrap--dragging': dragIndex === i,
            'queue__row-wrap--drop': dropTarget === i && dragIndex !== null && dragIndex !== i,
          }"
          draggable="true"
          @dragstart="onDragStart(i, $event)"
          @dragover="onDragOver(i, $event)"
          @drop="onDrop(i, $event)"
          @dragend="onDragEnd"
        >
          <QueueRow
            :track="track"
            :index="i"
            :current="i === index"
            :playing="i === index && isPlaying"
            @play="playAt"
            @remove="remove"
          />
        </div>
      </ol>
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
}
.queue__row-wrap--dragging :deep(.queue__row) {
  opacity: 0.5;
  transform: scale(0.99);
}
.queue__row-wrap--drop::before {
  content: "";
  position: absolute;
  left: 8px;
  right: 8px;
  top: -3px;
  height: 2px;
  border-radius: 1px;
  background: linear-gradient(90deg, var(--accent-1), var(--accent-3));
  z-index: 1;
}
:deep(.queue__row) {
  position: relative;
  display: grid;
  grid-template-columns: 18px 28px 40px 1fr auto auto 32px;
  align-items: center;
  gap: 12px;
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
  background: linear-gradient(135deg, rgba(26, 140, 255, 0.12), rgba(109, 60, 255, 0.08));
  color: var(--accent-1);
}
:deep(.queue__row--current .queue__artist),
:deep(.queue__row--current .queue__duration) {
  color: var(--accent-1);
  opacity: 0.85;
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
  width: 40px;
  height: 40px;
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
  cursor: pointer;
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
  gap: 2px;
  opacity: 0;
  transition: opacity var(--motion-duration-fast) var(--motion-ease-out);
}
:deep(.queue__row:hover .queue__actions) {
  opacity: 1;
}
:deep(.queue__action) {
  width: 28px;
  height: 28px;
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
  width: 28px;
  height: 28px;
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
</style>
