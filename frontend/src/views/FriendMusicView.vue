<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { api, APIError } from "@/api/client";
import { usePlayerStore } from "@/stores/player";
import type { Track, User } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import TrackList from "@/components/TrackList.vue";
import Spinner from "@/components/Spinner.vue";
import { tracksLabel } from "@/composables/useFormat";

const props = defineProps<{ id: string }>();
const router = useRouter();
const player = usePlayerStore();

const friend = ref<User | null>(null);
const tracks = ref<Track[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load() {
  loading.value = true;
  error.value = null;
  tracks.value = [];
  friend.value = null;
  try {
    const userId = Number(props.id);
    const [user, list] = await Promise.all([
      api.user(userId),
      api.musicOfOwner(userId, { count: 200 }),
    ]);
    friend.value = user;
    tracks.value = list.items;
  } catch (err) {
    error.value =
      err instanceof APIError
        ? err.detail.message || "Не удалось загрузить музыку"
        : (err as Error).message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);
watch(() => props.id, load);

function playAll() {
  if (tracks.value.length) player.playQueue(tracks.value);
}
</script>

<template>
  <ScrollArea>
    <PageHeader
      :eyebrow="friend ? `Музыка ${friend.first_name}` : 'Музыка друга'"
      :title="friend ? `${friend.first_name} ${friend.last_name}` : 'Загрузка…'"
      :subtitle="tracks.length ? tracksLabel(tracks.length) : 'Возможно, музыка скрыта'"
    >
      <template #actions>
        <button class="btn btn--primary" :disabled="!tracks.length" @click="playAll">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          Слушать
        </button>
        <button class="btn btn--ghost" @click="router.back()">Назад</button>
      </template>
    </PageHeader>

    <section class="friend-music">
      <div v-if="loading" class="friend-music__loading">
        <Spinner :size="20" /> Получаем треки друга…
      </div>
      <div v-else-if="error" class="friend-music__error">{{ error }}</div>
      <TrackList
        v-else
        :tracks="tracks"
        show-index
        empty-title="Музыка недоступна"
        empty-subtitle="ВК запретил доступ к аудио этого пользователя"
      />
    </section>
  </ScrollArea>
</template>

<style scoped>
.friend-music {
  padding: 0 32px 24px;
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
  font-size: 13px;
}
</style>
