<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, APIError } from "@/api/client";
import { usePlayerStore } from "@/stores/player";
import type { Track, User } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import { tracksLabel } from "@/composables/useFormat";

const PAGE_SIZE = 100;

const props = defineProps<{ id: string }>();
const router = useRouter();
const player = usePlayerStore();

const friend = ref<User | null>(null);
const tracks = ref<Track[]>([]);
const total = ref(0);
const loading = ref(false);
const loadingMore = ref(false);
const loadingAll = ref(false);
const error = ref<string | null>(null);
const query = ref("");

const hasMore = computed(() => total.value > 0 && tracks.value.length < total.value);

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return tracks.value;
  return tracks.value.filter(
    (t: Track) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
});

const subtitle = computed(() => {
  if (query.value.trim().length > 0) {
    return `Найдено ${tracksLabel(filtered.value.length)} из ${tracks.value.length}`;
  }
  if (!tracks.value.length) return "Возможно, музыка скрыта";
  if (total.value && total.value > tracks.value.length) {
    return `${tracksLabel(tracks.value.length)} из ${total.value}`;
  }
  return tracksLabel(tracks.value.length);
});

async function load() {
  loading.value = true;
  error.value = null;
  tracks.value = [];
  total.value = 0;
  friend.value = null;
  query.value = "";
  try {
    const userId = Number(props.id);
    const [user, list] = await Promise.all([
      api.user(userId),
      api.musicOfOwner(userId, { count: PAGE_SIZE, offset: 0 }),
    ]);
    friend.value = user;
    tracks.value = list.items;
    total.value = list.count;
  } catch (err) {
    error.value =
      err instanceof APIError
        ? err.detail.message || "Не удалось загрузить музыку"
        : (err as Error).message;
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value || loading.value || loadingAll.value) return;
  loadingMore.value = true;
  try {
    const userId = Number(props.id);
    const list = await api.musicOfOwner(userId, {
      count: PAGE_SIZE,
      offset: tracks.value.length,
    });
    const have = new Set(tracks.value.map((t) => `${t.owner_id}_${t.id}`));
    const fresh = list.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
    tracks.value = [...tracks.value, ...fresh];
    if (list.count > 0) total.value = list.count;
  } catch {
    // swallow — the next scroll will retry
  } finally {
    loadingMore.value = false;
  }
}

async function loadAll() {
  if (loadingAll.value || loading.value) return;
  loadingAll.value = true;
  error.value = null;
  try {
    const userId = Number(props.id);
    if (tracks.value.length === 0) {
      const [user, list] = await Promise.all([
        api.user(userId),
        api.musicOfOwner(userId, { count: PAGE_SIZE, offset: 0 }),
      ]);
      friend.value = user;
      tracks.value = list.items;
      total.value = list.count;
    }

    while (tracks.value.length < total.value) {
      // Add a small delay between requests to avoid VK API rate limiting (flood control)
      await new Promise((resolve) => setTimeout(resolve, 150));

      const list = await api.musicOfOwner(userId, {
        count: PAGE_SIZE,
        offset: tracks.value.length,
      });
      if (list.items.length === 0) {
        total.value = tracks.value.length;
        break;
      }
      const have = new Set(tracks.value.map((t) => `${t.owner_id}_${t.id}`));
      const fresh = list.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
      if (fresh.length === 0) {
        total.value = tracks.value.length;
        break;
      }
      tracks.value = [...tracks.value, ...fresh];
      if (list.count > 0) total.value = list.count;
    }
  } catch (err) {
    error.value =
      err instanceof APIError
        ? err.detail.message || "Не удалось загрузить все треки"
        : (err as Error).message;
  } finally {
    loadingAll.value = false;
  }
}

onMounted(load);
watch(() => props.id, load);

function playAll() {
  if (filtered.value.length) player.playQueue(filtered.value);
}
</script>

<template>
  <ScrollArea @reach-end="loadMore">
    <PageHeader
      :eyebrow="friend ? `Музыка ${friend.first_name}` : 'Музыка друга'"
      :title="friend ? `${friend.first_name} ${friend.last_name}` : 'Загрузка…'"
      :subtitle="subtitle"
    >
      <template #actions>
        <button
          v-if="hasMore"
          class="btn btn--ghost friend-music__load-all"
          :disabled="loadingAll || loading"
          @click="loadAll"
        >
          <Spinner v-if="loadingAll" :size="14" />
          <span v-if="loadingAll">Загружено {{ tracks.length }} из {{ total }}</span>
          <span v-else>Загрузить всё</span>
        </button>
        <button class="btn btn--primary" :disabled="!filtered.length" @click="playAll">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Слушать
        </button>
        <button class="btn btn--ghost" @click="router.back()">Назад</button>
        <input
          v-model="query"
          class="input friend-music__filter"
          placeholder="Поиск по аудиозаписям"
          aria-label="Поиск"
        />
      </template>
    </PageHeader>

    <section class="friend-music">
      <div v-if="loading" class="friend-music__loading">
        <Spinner :size="20" /> Получаем треки друга…
      </div>
      <div v-else-if="error" class="friend-music__error">{{ error }}</div>
      <template v-else>
        <TrackList
          :tracks="filtered"
          show-index
          :empty-title="query ? 'Ничего не найдено' : 'Музыка недоступна'"
          :empty-subtitle="query ? 'Попробуйте изменить поисковый запрос' : 'ВК запретил доступ к аудио этого пользователя'"
        />
        <div v-if="loadingMore" class="friend-music__loading">
          <Spinner :size="16" /> Подгружаем ещё…
        </div>
      </template>
    </section>
  </ScrollArea>
</template>

<style scoped>
.friend-music {
  padding: 0 32px 24px;
}
.friend-music__filter {
  width: 240px;
  height: 38px;
}
.friend-music__load-all {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.friend-music__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  padding: 12px 0;
}
.friend-music__error {
  color: var(--danger);
  padding: 12px 0;
  font-size: calc(13px * var(--font-scale, 1));
}
</style>
