<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
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

type Scope = "global" | "library";

const library = useLibraryStore();
const player = usePlayerStore();
const router = useRouter();
const route = useRoute();
const { myMusic } = storeToRefs(library);

const query = ref(typeof route.query.q === "string" ? route.query.q : "");
const scope = ref<Scope>("global");
const debounceMs = 350;

const results = ref<Track[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

let debounceHandle: number | null = null;

onMounted(() => {
  void library.loadMyMusic();
  if (query.value.trim()) void runGlobal();
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
    const list = await api.search({ q, performer_only: false, count: 100 });
    results.value = list.items;
  } catch (err) {
    error.value =
      err instanceof APIError ? err.detail.message || "Не удалось" : (err as Error).message;
  } finally {
    loading.value = false;
  }
}

watch(query, (value) => {
  if (debounceHandle) window.clearTimeout(debounceHandle);
  // Reflect query into URL so deep links / 'find similar' work both ways.
  const next = value.trim();
  const current = typeof route.query.q === "string" ? route.query.q : "";
  if (next !== current) {
    void router.replace({ name: "search", query: next ? { q: next } : undefined });
  }
  debounceHandle = window.setTimeout(() => {
    void runGlobal();
  }, debounceMs);
});

watch(
  () => route.query.q,
  (value) => {
    const incoming = typeof value === "string" ? value : "";
    if (incoming !== query.value) query.value = incoming;
  }
);

function playMany(tracks: Track[]) {
  if (tracks.length) player.playQueue(tracks);
}
</script>

<template>
  <ScrollArea>
    <PageHeader eyebrow="Поиск" title="Найти музыку" subtitle="Один запрос — ищем по всей ВК и в твоей библиотеке. Переключай вкладки ниже.">
      <template #actions>
        <div class="search__bar">
          <input
            v-model="query"
            class="input search__input"
            placeholder="Название трека или исполнителя"
            autofocus
          />
        </div>
        <div class="search__segmented" role="tablist">
          <button
            class="search__seg"
            :class="{ 'search__seg--active': scope === 'global' }"
            @click="scope = 'global'"
            role="tab"
            :aria-selected="scope === 'global'"
          >
            Везде
          </button>
          <button
            class="search__seg"
            :class="{ 'search__seg--active': scope === 'library' }"
            @click="scope = 'library'"
            role="tab"
            :aria-selected="scope === 'library'"
          >
            В библиотеке
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

      <template v-else>
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
.search__segmented {
  display: inline-flex;
  padding: 4px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  gap: 2px;
}
.search__seg {
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  transition:
    background var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
}
.search__seg:hover:not(.search__seg--active) {
  color: var(--text-0);
}
.search__seg--active {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: var(--accent-text, #fff);
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
