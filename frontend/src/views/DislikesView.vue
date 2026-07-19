<script setup lang="ts">
import { computed } from "vue";
import { useDislikesStore } from "@/stores/dislikes";
import { usePlayerStore } from "@/stores/player";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import { tracksLabel } from "@/composables/useFormat";
import type { Track } from "@/api/types";

const dislikesStore = useDislikesStore();
const player = usePlayerStore();

const tracks = computed(() => Array.from(dislikesStore.tracks.values()));
const subtitle = computed(() => tracksLabel(tracks.value.length));

function handlePlay(_track: Track, index: number) {
  player.playQueue(tracks.value, index, { autoPlay: true });
}

function playAll() {
  if (!tracks.value.length) return;
  player.playQueue(tracks.value, 0, { autoPlay: true });
}

function shufflePlay() {
  if (!tracks.value.length) return;
  player.shuffle = true;
  player.playQueue(tracks.value, -1, { autoPlay: true });
}
</script>

<template>
  <ScrollArea>
    <PageHeader
      title="Дизлайкнутые треки"
      :subtitle="subtitle"
    >
      <template #actions>
        <button class="btn btn--primary" :disabled="!tracks.length" @click="playAll">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Слушать
        </button>
        <button class="btn btn--ghost" :disabled="!tracks.length" @click="shufflePlay">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" />
          </svg>
          Перемешать
        </button>
      </template>
    </PageHeader>

    <section class="dislikes-view">
      <div class="dislikes-info">
        ВКонтакте не сохраняет список ваших дизлайков, поэтому мы бережно храним их прямо на вашем устройстве.
      </div>
      <TrackList
        :tracks="tracks"
        show-index
        manual-play
        empty-title="Тут пока пусто"
        empty-subtitle="Вы не дизлайкнули ни одного трека"
        @play="handlePlay"
      />
    </section>
  </ScrollArea>
</template>

<style scoped>
.dislikes-view {
  padding: 0 32px 24px;
}

.dislikes-info {
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.5;
  display: flex;
  align-items: center;
  gap: 12px;
}

.dislikes-info::before {
  content: "💡";
  font-size: 20px;
}
</style>
