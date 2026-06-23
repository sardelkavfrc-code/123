<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useLibraryStore } from "@/stores/library";
import { useMotion } from "@/composables/useSpring";
import type { User } from "@/api/types";
import PageHeader from "@/components/PageHeader.vue";
import ScrollArea from "@/components/ScrollArea.vue";
import EmptyState from "@/components/EmptyState.vue";
import Spinner from "@/components/Spinner.vue";
import { friendsLabel } from "@/composables/useFormat";

const library = useLibraryStore();
const motion = useMotion();
const { friends, friendsLoading } = storeToRefs(library);
const query = ref("");

onMounted(() => {
  void library.loadFriends();
});

const visibleFriends = computed(() => {
  if (!friends.value) return [];
  // VK never exposes audio of friends who hide it, so showing locked profiles
  // is just noise — drop them unconditionally.
  const base = friends.value.items.filter((u: User) => u.audio_visible);
  const q = query.value.trim().toLowerCase();
  if (!q) return base;
  return base.filter((u: User) =>
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
      <div v-else class="friends__list">
        <RouterLink
          v-for="(friend, i) in visibleFriends"
          :key="friend.id"
          :to="{ name: 'friend-music', params: { id: friend.id } }"
          class="friends__list-item hover-lift"
          :class="{ 'friends__list-item--locked': !friend.audio_visible }"
          v-motion="tileVariants(i)"
        >
          <div
            class="friends__avatar"
            :style="friend.photo ? { backgroundImage: `url(${friend.photo})` } : undefined"
          >
            <span v-if="!friend.photo">{{ friend.first_name.charAt(0) }}</span>
            <span v-if="!friend.audio_visible" class="friends__lock" title="Музыка скрыта">🔒</span>
          </div>
          <div class="friends__info">
            <div class="friends__name">{{ friend.first_name }} {{ friend.last_name }}</div>
            <div class="friends__sub">{{ friend.audio_visible ? 'Музыка открыта' : 'Музыка скрыта' }}</div>
          </div>
          <div class="friends__arrow">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
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
.friends__loading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  padding: 12px 0;
}
.friends__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.friends__list-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  text-decoration: none;
  transition: all var(--motion-duration-fast);
}
.friends__list-item:hover {
  background: var(--bg-2);
  border-color: var(--border-strong);
}
.friends__list-item--locked {
  opacity: 0.5;
}
.friends__avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--bg-3);
  background-size: cover;
  background-position: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-1);
  font-size: calc(18px * var(--font-scale, 1));
  font-weight: 700;
  flex-shrink: 0;
  position: relative;
}
.friends__lock {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: var(--bg-1);
  border: 1px solid var(--border-strong);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: calc(10px * var(--font-scale, 1));
}
.friends__info {
  flex-grow: 1;
  min-width: 0;
}
.friends__name {
  font-weight: 600;
  font-size: calc(15px * var(--font-scale, 1));
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.friends__sub {
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-3);
  margin-top: 2px;
}
.friends__arrow {
  color: var(--text-3);
  display: flex;
  align-items: center;
  transition: transform var(--motion-duration-fast), color var(--motion-duration-fast);
}
.friends__list-item:hover .friends__arrow {
  color: var(--accent-1);
  transform: translateX(4px);
}
</style>
