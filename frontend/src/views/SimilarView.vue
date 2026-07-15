<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, APIError } from "@/api/client";
import { usePlayerStore } from "@/stores/player";
import type { Track } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import { tracksLabel } from "@/composables/useFormat";

const props = defineProps<{ audioId: string }>();
const route = useRoute();
const router = useRouter();
const player = usePlayerStore();

const tracks = ref<Track[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const total = ref(0);
const error = ref<string | null>(null);

const hasMore = computed(() => total.value > 0 && tracks.value.length < total.value);

const hintedArtist = computed(() => {
  const v = route.query.artist;
  return typeof v === "string" ? v : null;
});
const hintedTitle = computed(() => {
  const v = route.query.title;
  return typeof v === "string" ? v : null;
});

const subtitle = computed(() => {
  if (hintedArtist.value && hintedTitle.value) {
    return `Алгоритмы ВК подобрали под «${hintedArtist.value} — ${hintedTitle.value}»`;
  }
  if (hintedTitle.value) return `Алгоритмы ВК подобрали под «${hintedTitle.value}»`;
  return "Алгоритмы ВК подобрали похожие треки";
});

async function load() {
  loading.value = true;
  error.value = null;
  tracks.value = [];
  total.value = 0;
  try {
    const res = await api.recommendations({
      target_audio: props.audioId,
      count: 50,
    });
    tracks.value = res.items;
    total.value = res.count;
  } catch (err) {
    error.value =
      err instanceof APIError
        ? err.detail.message || "Не удалось получить рекомендации"
        : (err as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.audioId, load);

async function onSimilarNearEnd() {
  if (!hasMore.value || loadingMore.value) return;
  loadingMore.value = true;
  try {
    const res = await api.recommendations({
      target_audio: props.audioId,
      count: 50,
      offset: tracks.value.length,
    });
    const have = new Set(tracks.value.map((t) => `${t.owner_id}_${t.id}`));
    const fresh = res.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
    tracks.value = [...tracks.value, ...fresh];
    if (res.count > 0) total.value = res.count;
    
    const newPlayable = fresh.filter((t) => t.url);
    if (newPlayable.length > 0) {
      player.appendTracksToQueue(newPlayable);
    }
  } catch (err) {
    console.error("Failed to load more similar tracks in player callback", err);
  } finally {
    loadingMore.value = false;
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value || loading.value) return;
  loadingMore.value = true;
  try {
    const res = await api.recommendations({
      target_audio: props.audioId,
      count: 50,
      offset: tracks.value.length,
    });
    const have = new Set(tracks.value.map((t) => `${t.owner_id}_${t.id}`));
    const fresh = res.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
    tracks.value = [...tracks.value, ...fresh];
    if (res.count > 0) total.value = res.count;
  } catch (err) {
    console.error("Failed to load more similar tracks", err);
  } finally {
    loadingMore.value = false;
  }
}

function playAll() {
  if (tracks.value.length) {
    player.playQueue(tracks.value, 0, { autoPlay: true }, onSimilarNearEnd);
  }
}

function handlePlay(_track: Track, index: number) {
  player.playQueue(tracks.value, index, { autoPlay: true }, onSimilarNearEnd);
}
</script>

<template>
  <ScrollArea @reach-end="loadMore">
    <PageHeader
      eyebrow="Похожие"
      :title="hintedTitle ? `Похожие на «${hintedTitle}»` : 'Похожие треки'"
      :subtitle="subtitle"
    >
      <template #actions>
        <button class="btn btn--primary" :disabled="!tracks.length" @click="playAll">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Слушать
        </button>
        <button class="btn btn--ghost" @click="router.back()">Назад</button>
      </template>
    </PageHeader>

    <section class="similar">
      <div v-if="loading" class="similar__loading"><Spinner :size="20" /> Подбираем похожие…</div>
      <div v-else-if="error" class="similar__error">{{ error }}</div>
      <template v-else>
        <div v-if="tracks.length" class="similar__head">
          <span>{{ tracksLabel(total || tracks.length) }}</span>
        </div>
        <TrackList
          :tracks="tracks"
          show-index
          manual-play
          empty-title="Похожих не нашлось"
          empty-subtitle="ВК не вернул рекомендации для этого трека"
          @play="handlePlay"
        />
        <div v-if="loadingMore" class="similar__loading">
          <Spinner :size="16" /> Подбираем ещё…
        </div>
      </template>
    </section>
  </ScrollArea>
</template>

<style scoped>
.similar {
  padding: 0 32px 24px;
}
.similar__head {
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
  margin-bottom: 8px;
}
.similar__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  padding: 12px 0;
}
.similar__error {
  color: var(--danger);
  padding: 12px 0;
  font-size: calc(13px * var(--font-scale, 1));
}
</style>
