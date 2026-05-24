<script setup lang="ts">
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { usePlayerStore } from "@/stores/player";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import EmptyState from "@/components/EmptyState.vue";
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
        <li
          v-for="(track, i) in queue"
          :key="`${track.owner_id}_${track.id}_${i}`"
          class="queue__row"
          :class="{
            'queue__row--current': i === index,
            'queue__row--playing': i === index && isPlaying,
            'queue__row--dragging': dragIndex === i,
            'queue__row--drop': dropTarget === i && dragIndex !== null && dragIndex !== i,
          }"
          draggable="true"
          @dragstart="onDragStart(i, $event)"
          @dragover="onDragOver(i, $event)"
          @drop="onDrop(i, $event)"
          @dragend="onDragEnd"
        >
          <span class="queue__handle" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <circle cx="8" cy="6" r="1.6" />
              <circle cx="8" cy="12" r="1.6" />
              <circle cx="8" cy="18" r="1.6" />
              <circle cx="16" cy="6" r="1.6" />
              <circle cx="16" cy="12" r="1.6" />
              <circle cx="16" cy="18" r="1.6" />
            </svg>
          </span>
          <span class="queue__index">
            <template v-if="i === index">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </template>
            <template v-else>{{ i + 1 }}</template>
          </span>
          <button class="queue__cover" :title="`Играть «${track.title}»`" @click="playAt(i)">
            <img v-if="track.album_cover" :src="track.album_cover" :alt="track.title" loading="lazy" />
            <span v-else class="queue__cover-stub">{{ track.title.charAt(0) }}</span>
          </button>
          <div class="queue__meta" @click="playAt(i)">
            <div class="queue__title">{{ track.title }}</div>
            <div class="queue__artist">{{ track.artist }}</div>
          </div>
          <span class="queue__duration">{{ formatDuration(track.duration) }}</span>
          <button class="queue__remove" title="Удалить из очереди" @click.stop="remove(i)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </li>
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
.queue__row {
  position: relative;
  display: grid;
  grid-template-columns: 18px 28px 40px 1fr auto 32px;
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
.queue__row:hover {
  background: var(--bg-2);
}
.queue__row--current {
  background: linear-gradient(135deg, rgba(26, 140, 255, 0.12), rgba(109, 60, 255, 0.08));
  color: var(--accent-1);
}
.queue__row--current .queue__artist,
.queue__row--current .queue__duration {
  color: var(--accent-1);
  opacity: 0.85;
}
.queue__row--dragging {
  opacity: 0.5;
  transform: scale(0.99);
}
.queue__row--drop::before {
  content: "";
  position: absolute;
  left: 8px;
  right: 8px;
  top: -3px;
  height: 2px;
  border-radius: 1px;
  background: linear-gradient(90deg, var(--accent-1), var(--accent-3));
}
.queue__handle {
  display: inline-flex;
  color: var(--text-3);
  cursor: grab;
}
.queue__row:active .queue__handle {
  cursor: grabbing;
}
.queue__index {
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--text-3);
  font-size: 12px;
}
.queue__row--current .queue__index {
  color: var(--accent-1);
}
.queue__cover {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.queue__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.queue__cover-stub {
  font-weight: 700;
  color: var(--text-2);
}
.queue__meta {
  min-width: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.queue__title {
  font-weight: 600;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.queue__artist {
  color: var(--text-2);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.queue__duration {
  color: var(--text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.queue__remove {
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
.queue__row:hover .queue__remove {
  opacity: 1;
}
.queue__remove:hover {
  background: rgba(255, 94, 126, 0.16);
  color: var(--danger);
}
</style>
