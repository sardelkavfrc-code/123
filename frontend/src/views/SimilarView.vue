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
const error = ref<string | null>(null);

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
  try {
    const res = await api.recommendations({
      target_audio: props.audioId,
      count: 100,
    });
    tracks.value = res.items;
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

function playAll() {
  if (tracks.value.length) player.playQueue(tracks.value);
}
</script>

<template>
  <ScrollArea>
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
          <span>{{ tracksLabel(tracks.length) }}</span>
        </div>
        <TrackList
          :tracks="tracks"
          show-index
          empty-title="Похожих не нашлось"
          empty-subtitle="ВК не вернул рекомендации для этого трека"
        />
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
  font-size: 13px;
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
  font-size: 13px;
}
</style>
