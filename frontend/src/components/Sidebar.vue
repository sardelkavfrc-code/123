<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const photo = computed(() => auth.status.photo);
const name = computed(() => auth.displayName);

const items = [
  { to: { name: "home" }, label: "Главная", icon: "home" },
  { to: { name: "library" }, label: "Моя музыка", icon: "library" },
  { to: { name: "friends" }, label: "Друзья", icon: "friends" },
  { to: { name: "search" }, label: "Поиск", icon: "search" },
  { to: { name: "queue" }, label: "Очередь", icon: "queue" },
  { to: { name: "settings" }, label: "Настройки", icon: "settings" },
];
</script>

<template>
  <aside class="sidebar">
    <RouterLink :to="{ name: 'settings' }" class="sidebar__profile">
      <div class="sidebar__avatar" :style="photo ? { backgroundImage: `url(${photo})` } : undefined">
        <span v-if="!photo">{{ name.charAt(0) }}</span>
      </div>
      <div class="sidebar__profile-text">
        <div class="sidebar__profile-name">{{ name }}</div>
        <div class="sidebar__profile-sub">ВКонтакте</div>
      </div>
    </RouterLink>

    <nav class="sidebar__nav">
      <RouterLink
        v-for="item in items"
        :key="item.label"
        :to="item.to"
        class="sidebar__link"
        active-class="sidebar__link--active"
      >
        <span class="sidebar__icon" :data-icon="item.icon" />
        <span class="sidebar__label">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 14px 20px;
  background: var(--bg-1);
  border-right: 1px solid var(--border);
  gap: 18px;
}
.sidebar__profile {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px;
  border-radius: var(--radius-md);
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
}
.sidebar__profile:hover {
  background: var(--bg-2);
}
.sidebar__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background-color: var(--bg-3);
  background-size: cover;
  background-position: center;
  flex: 0 0 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-1);
  font-weight: 600;
  font-size: 16px;
}
.sidebar__profile-text {
  min-width: 0;
}
.sidebar__profile-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar__profile-sub {
  font-size: 11px;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
}
.sidebar__link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--text-1);
  font-weight: 500;
  font-size: 14px;
  transition:
    background var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
}
.sidebar__link:hover {
  background: var(--bg-2);
  color: var(--text-0);
}
.sidebar__link--active {
  background: linear-gradient(135deg, rgba(26, 140, 255, 0.18), rgba(109, 60, 255, 0.18));
  color: var(--text-0);
  position: relative;
}
.sidebar__link--active::before {
  content: "";
  position: absolute;
  left: 4px;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--accent-1), var(--accent-3));
}
.sidebar__icon {
  width: 20px;
  height: 20px;
  flex: 0 0 20px;
  display: inline-block;
  background: currentColor;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  mask-size: contain;
}
.sidebar__icon[data-icon="home"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="library"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M9 5v10.5A3.5 3.5 0 1 1 7 12V3h11v2zM19 8v8.5a3.5 3.5 0 1 1-2-3.16V6.5L11 8V6.36z'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M9 5v10.5A3.5 3.5 0 1 1 7 12V3h11v2zM19 8v8.5a3.5 3.5 0 1 1-2-3.16V6.5L11 8V6.36z'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="friends"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.67 0-8 1.34-8 4v3h11v-3c0-1.85 1.13-3.34 3-4.42A14.3 14.3 0 0 0 8 13Zm8 0c-.29 0-.62 0-.97.03 1.16.83 1.97 2.04 1.97 3.97v3h7v-3c0-2.66-5.33-4-8-4Z'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 0a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-2.67 0-8 1.34-8 4v3h11v-3c0-1.85 1.13-3.34 3-4.42A14.3 14.3 0 0 0 8 13Zm8 0c-.29 0-.62 0-.97.03 1.16.83 1.97 2.04 1.97 3.97v3h7v-3c0-2.66-5.33-4-8-4Z'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="search"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.5 7L21 18.5 19.5 20 14 14.5z'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm5.5 7L21 18.5 19.5 20 14 14.5z'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="queue"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6h13M3 12h13M3 18h9'/%3E%3Cpath d='M16 14v8l6-4z'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6h13M3 12h13M3 18h9'/%3E%3Cpath d='M16 14v8l6-4z'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="settings"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4Zm9.4 4 1.6 2-1 1.7-2.5-.4a8 8 0 0 1-1.7 1l-.4 2.5h-2L15 16.3a8 8 0 0 1-1.7-1l-2.5.4-1-1.7 1.6-2-1.6-2 1-1.7L13.3 9a8 8 0 0 1 1.7-1l.4-2.5h2L17.8 8a8 8 0 0 1 1.7 1l2.5-.4 1 1.7-1.6 2Z'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='currentColor'%3E%3Cpath d='M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4Zm9.4 4 1.6 2-1 1.7-2.5-.4a8 8 0 0 1-1.7 1l-.4 2.5h-2L15 16.3a8 8 0 0 1-1.7-1l-2.5.4-1-1.7 1.6-2-1.6-2 1-1.7L13.3 9a8 8 0 0 1 1.7-1l.4-2.5h2L17.8 8a8 8 0 0 1 1.7 1l2.5-.4 1 1.7-1.6 2Z'/%3E%3C/svg%3E");
}
</style>
