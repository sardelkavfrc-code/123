<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { api, APIError } from "@/api/client";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import type { Track } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import EmptyState from "@/components/EmptyState.vue";
import Spinner from "@/components/Spinner.vue";

type Scope = "global" | "library" | "similar";

const library = useLibraryStore();
const player = usePlayerStore();
const { myMusic } = storeToRefs(library);

const query = ref("");
const scope = ref<Scope>("global");
const debounceMs = 350;

const results = ref<Track[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const performerOnly = ref(false);

const { current } = storeToRefs(player);
const similar = ref<Track[]>([]);
const similarLoading = ref(false);

let debounceHandle: number | null = null;

onMounted(() => {
  void library.loadMyMusic();
});

const libraryMatches = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  return myMusic.value.filter(
    (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q)
  );
});

async function runGlobal() {
  const q = query.value.trim();
  if (!q) {
    results.value = [];
    return;
  }
  loading.value = true;
  error.value = null;
  try {
    const list = await api.search({ q, performer_only: performerOnly.value, count: 100 });
    results.value = list.items;
  } catch (err) {
    error.value =
      err instanceof APIError ? err.detail.message || "Не удалось" : (err as Error).message;
  } finally {
    loading.value = false;
  }
}

async function refreshSimilar() {
  similar.value = [];
  if (!current.value) return;
  similarLoading.value = true;
  try {
    const list = await api.recommendations({
      target_audio: `${current.value.owner_id}_${current.value.id}`,
      count: 60,
    });
    similar.value = list.items;
  } finally {
    similarLoading.value = false;
  }
}

watch(query, () => {
  if (debounceHandle) window.clearTimeout(debounceHandle);
  if (scope.value !== "global") return;
  debounceHandle = window.setTimeout(() => {
    void runGlobal();
  }, debounceMs);
});

watch(scope, (value) => {
  if (value === "global") {
    void runGlobal();
  } else if (value === "similar") {
    void refreshSimilar();
  }
});

watch(performerOnly, () => {
  if (scope.value === "global") void runGlobal();
});

watch(
  () => current.value?.id,
  () => {
    if (scope.value === "similar") void refreshSimilar();
  }
);

function playMany(tracks: Track[]) {
  if (tracks.length) player.playQueue(tracks);
}
</script>

<template>
  <ScrollArea>
    <PageHeader eyebrow="Поиск" title="Найти музыку" subtitle="Глобальный поиск ВК, поиск в библиотеке и похожие треки для текущего трека.">
      <template #actions>
        <div class="search__bar">
          <input
            v-model="query"
            class="input search__input"
            placeholder="Название трека или исполнителя"
            autofocus
          />
          <label class="search__check">
            <input v-model="performerOnly" type="checkbox" />
            <span>Только исполнители</span>
          </label>
        </div>
        <div class="search__tabs">
          <button class="chip" :class="{ 'chip--active': scope === 'global' }" @click="scope = 'global'">
            Глобальный
          </button>
          <button class="chip" :class="{ 'chip--active': scope === 'library' }" @click="scope = 'library'">
            В библиотеке
          </button>
          <button
            class="chip"
            :class="{ 'chip--active': scope === 'similar' }"
            :disabled="!current"
            @click="scope = 'similar'"
          >
            Похожие на текущий
          </button>
        </div>
      </template>
    </PageHeader>

    <section class="search">
      <template v-if="scope === 'global'">
        <div v-if="loading" class="search__loading"><Spinner :size="18" /> Ищем «{{ query }}»…</div>
        <div v-else-if="error" class="search__error">{{ error }}</div>
        <div v-else-if="!query.trim()">
          <EmptyState title="Начни печатать" subtitle="Введи название или исполнителя — поиск стартует автоматически" />
        </div>
        <div v-else class="search__pane">
          <div class="search__head">
            <span>Найдено {{ results.length }}</span>
            <button class="btn btn--ghost" :disabled="!results.length" @click="playMany(results)">
              Слушать всё
            </button>
          </div>
          <TrackList :tracks="results" show-index empty-title="Ничего не нашлось" />
        </div>
      </template>

      <template v-else-if="scope === 'library'">
        <div v-if="!query.trim()">
          <EmptyState title="Поиск в твоей музыке" subtitle="Введи название — поищем в локально сохранённой библиотеке" />
        </div>
        <div v-else class="search__pane">
          <div class="search__head">
            <span>Найдено в библиотеке: {{ libraryMatches.length }}</span>
            <button
              class="btn btn--ghost"
              :disabled="!libraryMatches.length"
              @click="playMany(libraryMatches)"
            >
              Слушать всё
            </button>
          </div>
          <TrackList
            :tracks="libraryMatches"
            show-index
            empty-title="Ничего не нашлось"
            empty-subtitle="Сохрани трек в библиотеку, чтобы он появлялся здесь"
          />
        </div>
      </template>

      <template v-else>
        <div v-if="!current">
          <EmptyState title="Сначала запусти трек" subtitle="Похожие подберём по тому, что сейчас играет" />
        </div>
        <div v-else>
          <div class="search__head">
            <span>Похожие на «{{ current.title }}»</span>
            <button class="btn btn--ghost" :disabled="!similar.length" @click="playMany(similar)">
              Слушать всё
            </button>
          </div>
          <div v-if="similarLoading" class="search__loading">
            <Spinner :size="18" /> Подбираем похожие…
          </div>
          <TrackList v-else :tracks="similar" show-index empty-title="Похожих не нашлось" />
        </div>
      </template>
    </section>
  </ScrollArea>
</template>

<style scoped>
.search {
  padding: 0 32px 24px;
}
.search__bar {
  display: flex;
  flex: 1 1 360px;
  align-items: center;
  gap: 14px;
}
.search__input {
  flex: 1 1 auto;
  min-width: 240px;
  height: 42px;
}
.search__check {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
}
.search__tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.search__pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.search__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-2);
  font-size: 13px;
}
.search__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  padding: 12px 0;
}
.search__error {
  color: var(--danger);
  padding: 12px 0;
  font-size: 13px;
}
</style>
