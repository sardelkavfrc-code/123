<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useLibraryStore } from "@/stores/library";
import { useMotion } from "@/composables/useSpring";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import EmptyState from "@/components/EmptyState.vue";
import Spinner from "@/components/Spinner.vue";
import { friendsLabel } from "@/composables/useFormat";

const library = useLibraryStore();
const motion = useMotion();
const { friends, friendsLoading } = storeToRefs(library);
const query = ref("");
const showHidden = ref(false);

onMounted(() => {
  void library.loadFriends();
});

const visibleFriends = computed(() => {
  if (!friends.value) return [];
  const base = showHidden.value ? friends.value.items : friends.value.items.filter((u) => u.audio_visible);
  const q = query.value.trim().toLowerCase();
  if (!q) return base;
  return base.filter((u) =>
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
  );
});

const tileVariants = (i: number) =>
  motion.spring({ opacity: 0, y: 10 }, { opacity: 1, y: 0 }, { stiffness: 240, damping: 26, delay: i * 0.025 });
</script>

<template>
  <ScrollArea>
    <PageHeader
      eyebrow="Музыка друзей"
      title="Друзья"
      :subtitle="friends ? `${friendsLabel(friends.visible_count)} с открытой музыкой из ${friends.count}` : 'Загружаем список друзей…'"
    >
      <template #actions>
        <input v-model="query" class="input friends__filter" placeholder="Найти друга" />
        <label class="friends__toggle" :class="{ 'friends__toggle--on': showHidden }">
          <input v-model="showHidden" type="checkbox" class="friends__toggle-input" />
          <span class="friends__toggle-track" aria-hidden="true" />
          <span class="friends__toggle-label">Показывать со скрытой музыкой</span>
        </label>
      </template>
    </PageHeader>

    <section class="friends">
      <div v-if="friendsLoading && !friends" class="friends__loading">
        <Spinner :size="20" /> Получаем друзей…
      </div>
      <EmptyState
        v-else-if="!visibleFriends.length"
        title="Нет друзей с открытой музыкой"
        subtitle="ВК API возвращает только тех, у кого настройки приватности позволяют просмотр аудио"
      />
      <div v-else class="friends__grid">
        <RouterLink
          v-for="(friend, i) in visibleFriends"
          :key="friend.id"
          :to="{ name: 'friend-music', params: { id: friend.id } }"
          class="friends__card hover-lift"
          :class="{ 'friends__card--locked': !friend.audio_visible }"
          v-motion="tileVariants(i)"
        >
          <div
            class="friends__avatar"
            :style="friend.photo ? { backgroundImage: `url(${friend.photo})` } : undefined"
          >
            <span v-if="!friend.photo">{{ friend.first_name.charAt(0) }}</span>
            <span v-if="!friend.audio_visible" class="friends__lock" title="Музыка скрыта">🔒</span>
          </div>
          <div class="friends__name">{{ friend.first_name }} {{ friend.last_name }}</div>
          <div class="friends__sub">{{ friend.audio_visible ? 'Музыка открыта' : 'Музыка скрыта' }}</div>
        </RouterLink>
      </div>
    </section>
  </ScrollArea>
</template>

<style scoped>
.friends {
  padding: 0 32px 32px;
}
.friends__filter {
  width: 240px;
  height: 38px;
}
.friends__toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-1);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}
.friends__toggle-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}
.friends__toggle-track {
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--bg-3);
  position: relative;
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
}
.friends__toggle-track::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  transition: transform var(--motion-duration-fast) var(--motion-ease-out);
}
.friends__toggle--on .friends__toggle-track {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
}
.friends__toggle--on .friends__toggle-track::after {
  transform: translateX(16px);
}
.friends__toggle-label {
  color: var(--text-2);
  font-size: 12px;
}
.friends__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  padding: 12px 0;
}
.friends__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 14px;
}
.friends__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 12px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-align: center;
}
.friends__card--locked {
  opacity: 0.5;
}
.friends__avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background-color: var(--bg-3);
  background-size: cover;
  background-position: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-1);
  font-size: 26px;
  font-weight: 700;
  position: relative;
}
.friends__lock {
  position: absolute;
  bottom: -2px;
  right: -2px;
  background: var(--bg-1);
  border: 1px solid var(--border-strong);
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.friends__name {
  font-weight: 600;
  font-size: 13px;
  color: var(--text-0);
}
.friends__sub {
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
</style>
