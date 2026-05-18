<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api, APIError } from "@/api/client";
import type { Artist, Track } from "@/api/types";
import { usePlayerStore } from "@/stores/player";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import { tracksLabel } from "@/composables/useFormat";

const props = defineProps<{ id: string }>();
const router = useRouter();
const route = useRoute();
const player = usePlayerStore();

const artist = ref<Artist | null>(null);
const tracks = ref<Track[]>([]);
const similar = ref<Track[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const tracksWarning = ref<string | null>(null);

const hintedName = computed(() => {
  const v = route.query.name;
  return typeof v === "string" ? v : null;
});

async function load() {
  loading.value = true;
  error.value = null;
  tracksWarning.value = null;
  artist.value = null;
  tracks.value = [];
  similar.value = [];

  // Run both calls independently — under the vk.com web token from
  // vkhost.github.io, artist methods may partially fail. Each side
  // falls back to a stub so the screen still renders something useful.
  const name = hintedName.value ?? undefined;

  const [infoRes, listRes] = await Promise.allSettled([
    api.artist(props.id, name ? { name } : {}),
    api.byArtist(props.id, { count: 100, ...(name ? { q: name } : {}) }),
  ]);

  if (infoRes.status === "fulfilled") {
    artist.value = infoRes.value;
  } else {
    artist.value = {
      id: props.id,
      name: name ?? props.id,
      domain: null,
      photo: null,
      is_followed: false,
    };
  }

  if (listRes.status === "fulfilled") {
    tracks.value = listRes.value.items;
  } else {
    const reason = listRes.reason;
    tracksWarning.value =
      reason instanceof APIError
        ? reason.detail.message || "Не удалось загрузить треки артиста"
        : (reason as Error).message || "Не удалось загрузить треки артиста";
  }

  try {
    if (tracks.value.length) {
      const first = tracks.value.find((t) => !!t.url) ?? tracks.value[0];
      const sim = await api.recommendations({
        target_audio: `${first.owner_id}_${first.id}`,
        count: 30,
      });
      similar.value = sim.items.filter(
        (t) => !tracks.value.some((tt) => tt.id === t.id && tt.owner_id === t.owner_id)
      );
    }
  } catch {
    // recommendations are nice-to-have, swallow
  }

  if (!artist.value && !tracks.value.length) {
    error.value = "Артист не найден";
  }

  loading.value = false;
}

onMounted(load);
watch(() => props.id, load);
watch(() => route.query.name, load);

function playAll() {
  if (tracks.value.length) player.playQueue(tracks.value);
}
</script>

<template>
  <ScrollArea>
    <section
      class="artist__hero"
      :style="artist?.photo ? { backgroundImage: `linear-gradient(180deg, rgba(8,9,14,0.15), rgba(8,9,14,0.7)), url(${artist.photo})` } : undefined"
    >
      <div class="artist__hero-inner">
        <div class="artist__eyebrow">Артист</div>
        <h1 class="artist__name">{{ artist?.name ?? "Загрузка…" }}</h1>
        <div class="artist__meta">
          <span v-if="tracks.length">{{ tracksLabel(tracks.length) }}</span>
          <span v-if="artist?.is_followed" class="chip chip--active">Подписка</span>
        </div>
        <div class="artist__actions">
          <button class="btn btn--primary" :disabled="!tracks.length" @click="playAll">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            Слушать
          </button>
          <button class="btn btn--ghost" @click="router.back()">Назад</button>
        </div>
      </div>
    </section>

    <PageHeader eyebrow="Треки" title="Все треки" />
    <section class="artist__body">
      <div v-if="loading" class="artist__loading"><Spinner :size="20" /> Загружаем артиста…</div>
      <div v-else-if="error" class="artist__error">{{ error }}</div>
      <template v-else>
        <div v-if="tracksWarning" class="artist__warn">{{ tracksWarning }}</div>
        <TrackList
          :tracks="tracks"
          show-index
          empty-title="У артиста пока нет треков"
        />
      </template>
    </section>

    <template v-if="similar.length">
      <PageHeader eyebrow="Похожие" title="С чем послушать дальше" />
      <section class="artist__body">
        <TrackList :tracks="similar.slice(0, 12)" show-index />
      </section>
    </template>
  </ScrollArea>
</template>

<style scoped>
.artist__hero {
  position: relative;
  margin: 16px 32px 0;
  border-radius: var(--radius-xl);
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  background-size: cover;
  background-position: center;
  color: #fff;
  overflow: hidden;
  min-height: 240px;
  display: flex;
  align-items: flex-end;
}
.artist__hero-inner {
  padding: 28px 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.artist__eyebrow {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  opacity: 0.85;
}
.artist__name {
  margin: 0;
  font-size: 38px;
  font-weight: 700;
  letter-spacing: -0.01em;
  text-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}
.artist__meta {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.85);
  font-size: 13px;
}
.artist__actions {
  display: flex;
  gap: 10px;
}
.artist__body {
  padding: 0 32px 24px;
}
.artist__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  padding: 12px 0;
}
.artist__error {
  color: var(--danger);
  padding: 12px 0;
  font-size: 13px;
}
.artist__warn {
  color: var(--text-2);
  background: var(--bg-2);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  margin-bottom: 12px;
  font-size: 13px;
}
</style>
