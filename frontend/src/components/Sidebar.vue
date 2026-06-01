<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";

const auth = useAuthStore();
const ui = useUIStore();
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

const route = useRoute();
const activeIndex = computed(() => items.findIndex((i) => i.to.name === route.name));
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--collapsed': ui.sidebarCollapsed }">
    <div class="sidebar__logo-wrap">
      <img src="/logo.png" alt="VK Music" class="sidebar__logo" />
      <div class="sidebar__logo-text-wrapper">
        <div class="sidebar__logo-text">VK Music</div>
      </div>
    </div>

    <RouterLink :to="{ name: 'settings' }" class="sidebar__profile" :title="ui.sidebarCollapsed ? 'Настройки профиля' : ''">
      <div class="sidebar__avatar" :style="photo ? { backgroundImage: `url(${photo})` } : undefined">
        <span v-if="!photo">{{ name.charAt(0) }}</span>
      </div>
      <div class="sidebar__profile-text">
        <div class="sidebar__profile-name">{{ name }}</div>
      </div>
    </RouterLink>

    <nav class="sidebar__nav">
      <div 
        class="sidebar__indicator" 
        :style="{ transform: `translateY(${activeIndex * 44}px)`, opacity: activeIndex >= 0 ? 1 : 0 }"
      ></div>
      <RouterLink
        v-for="item in items"
        :key="item.label"
        :to="item.to"
        class="sidebar__link"
        active-class="sidebar__link--active"
        :title="ui.sidebarCollapsed ? item.label : ''"
      >
        <span class="sidebar__icon" :data-icon="item.icon" />
        <span class="sidebar__label">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar__footer">
      <button class="sidebar__toggle" @click="ui.toggleSidebar()" :aria-label="ui.sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline :points="ui.sidebarCollapsed ? '9 18 15 12 9 6' : '15 18 9 12 15 6'" />
        </svg>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px 14px 20px;
  background: var(--bg-sidebar);
  backdrop-filter: var(--app-blur);
  border-right: 1px solid var(--border);
  gap: 18px;
  box-shadow: var(--app-shadow);
  position: relative;
}
.sidebar::before {
  content: "";
  display: var(--app-noise-display);
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.08'/%3E%3C/svg%3E");
  z-index: 10;
}
.sidebar__logo-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
  transition: padding var(--motion-duration-slow) cubic-bezier(0.2, 0.8, 0.2, 1);
  overflow: hidden;
}
.sidebar__logo {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  object-fit: contain;
  flex: 0 0 32px;
}
.sidebar__logo-text-wrapper {
  min-width: 0;
  max-width: 200px;
  transition: opacity var(--motion-duration-slow) var(--motion-ease-out), max-width var(--motion-duration-slow) var(--motion-ease-out), margin var(--motion-duration-slow) var(--motion-ease-out), transform var(--motion-duration-slow) var(--motion-ease-out);
  white-space: nowrap;
  overflow: hidden;
}
.sidebar--collapsed .sidebar__logo-text-wrapper {
  opacity: 0;
  max-width: 0;
  margin-left: -12px;
  transform: translateX(-10px);
}
.sidebar__logo-text {
  font-weight: 800;
  font-size: 16px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar__profile {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 8px 8px;
  border-radius: var(--radius-md);
  transition:
    padding var(--motion-duration-slow) cubic-bezier(0.2, 0.8, 0.2, 1),
    background-color var(--motion-duration-fast) var(--motion-ease-out);
  background-color: transparent;
}
.sidebar--collapsed .sidebar__profile {
  padding-left: 4px;
}
.sidebar__profile:hover {
  background-color: var(--bg-2);
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
  max-width: 200px;
  transition: opacity var(--motion-duration-slow) var(--motion-ease-out), max-width var(--motion-duration-slow) var(--motion-ease-out), margin var(--motion-duration-slow) var(--motion-ease-out), transform var(--motion-duration-slow) var(--motion-ease-out);
  white-space: nowrap;
  overflow: hidden;
}
.sidebar--collapsed .sidebar__profile-text {
  opacity: 0;
  max-width: 0;
  margin-left: -12px;
  transform: translateX(-10px);
}
.sidebar__profile-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar__nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 auto;
  position: relative;
}
.sidebar__indicator {
  position: absolute;
  left: 4px;
  top: 10px;
  width: 3px;
  height: 20px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--accent-1), var(--accent-3));
  transition: transform var(--motion-duration-slow) cubic-bezier(0.34, 1.56, 0.64, 1), opacity var(--motion-duration-fast);
  pointer-events: none;
}
.sidebar__link {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  color: var(--text-1);
  font-weight: 500;
  font-size: 14px;
  transition:
    padding var(--motion-duration-slow) cubic-bezier(0.2, 0.8, 0.2, 1),
    background-color var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
  background-color: transparent;
}
.sidebar--collapsed .sidebar__link {
  padding-left: 14px; /* Centers 20px icon inside 48px inner width */
}
.sidebar__label {
  min-width: 0;
  max-width: 200px;
  transition: opacity var(--motion-duration-slow) var(--motion-ease-out), max-width var(--motion-duration-slow) var(--motion-ease-out), margin var(--motion-duration-slow) var(--motion-ease-out), transform var(--motion-duration-slow) var(--motion-ease-out);
  white-space: nowrap;
  overflow: hidden;
}
.sidebar--collapsed .sidebar__label {
  opacity: 0;
  max-width: 0;
  margin-left: -12px;
  transform: translateX(-10px);
}
.sidebar__link:hover {
  background-color: var(--bg-2);
  color: var(--text-0);
}
.sidebar__link--active {
  background: linear-gradient(135deg, color-mix(in srgb, var(--accent-1) 18%, transparent), color-mix(in srgb, var(--accent-3) 18%, transparent));
  color: var(--text-0);
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
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/%3E%3Cpolyline points='9 22 9 12 15 12 15 22'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/%3E%3Cpolyline points='9 22 9 12 15 12 15 22'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="library"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="friends"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="search"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="queue"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15V6'/%3E%3Cpath d='M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'/%3E%3Cpath d='M12 12H3'/%3E%3Cpath d='M16 6H3'/%3E%3Cpath d='M12 18H3'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15V6'/%3E%3Cpath d='M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'/%3E%3Cpath d='M12 12H3'/%3E%3Cpath d='M16 6H3'/%3E%3Cpath d='M12 18H3'/%3E%3C/svg%3E");
}
.sidebar__icon[data-icon="settings"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'/%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'/%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3C/svg%3E");
}

.sidebar__footer {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
  padding: 4px 8px;
  transition: justify-content var(--motion-duration-slow) cubic-bezier(0.2, 0.8, 0.2, 1);
}
.sidebar--collapsed .sidebar__footer {
  justify-content: center;
}
.sidebar__toggle {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
  transition: background 0.2s, color 0.2s;
}
.sidebar__toggle:hover {
  background: var(--bg-2);
  color: var(--text-0);
}
</style>
