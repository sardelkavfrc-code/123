<script setup lang="ts">
import { computed } from "vue";
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
}>();

const player = usePlayerStore();

const playableTracks = computed(() => props.tracks.filter((t) => t.url));

function playAll(startIndex: number) {
  if (playableTracks.value.length === 0) return;
  player.playQueue(playableTracks.value, startIndex);
}

function indexInPlayable(track: Track): number {
  return playableTracks.value.findIndex((t) => t.id === track.id && t.owner_id === track.owner_id);
}
</script>

<template>
  <div v-if="tracks.length" class="track-list">
    <TrackRow
      v-for="(track, i) in tracks"
      :key="`${track.owner_id}_${track.id}_${i}`"
      :track="track"
      :index="i"
      :show-index="showIndex"
      :variant="variant"
      @dblclick="playAll(Math.max(0, indexInPlayable(track)))"
    />
  </div>
  <EmptyState
    v-else
    :title="emptyTitle ?? 'Пусто'"
    :subtitle="emptySubtitle ?? 'Здесь пока ничего нет'"
  />
</template>

<style scoped>
.track-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
