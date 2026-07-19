<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, nextTick } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUIStore } from "@/stores/ui";
import { useSettingsStore } from "@/stores/settings";
import SidebarSettingsModal from "./SidebarSettingsModal.vue";
import SvgIcon from "./SvgIcon.vue";
import type { IconName } from "@/utils/icons";

const auth = useAuthStore();
const ui = useUIStore();
const settings = useSettingsStore();

const photo = computed(() => auth.status.photo);
const name = computed(() => auth.displayName);

const ALL_SIDEBAR_ITEMS: Record<string, { to: { name: string }; label: string; icon: IconName }> = {
  home: { to: { name: "home" }, label: "Главная", icon: "home" },
  library: { to: { name: "library" }, label: "Моя музыка", icon: "library" },
  friends: { to: { name: "friends" }, label: "Друзья", icon: "friends" },
  queue: { to: { name: "queue" }, label: "Очередь", icon: "queue" },
  settings: { to: { name: "settings" }, label: "Настройки", icon: "settings" },
};

const items = computed(() => {
  return settings.sidebarItems
    .filter(item => item.visible)
    .map(item => ALL_SIDEBAR_ITEMS[item.id])
    .filter(Boolean);
});

const route = useRoute();
const activeIndex = computed(() => items.value.findIndex((i) => i.to.name === route.name));

const showContextMenu = ref(false);
const contextMenuPos = ref({ x: 0, y: 0 });

const isMouseOverSidebar = ref(false);
const isMouseOverContextMenu = ref(false);
let leaveTimeout: number | null = null;

function checkMouseLeave() {
  if (leaveTimeout) window.clearTimeout(leaveTimeout);
  leaveTimeout = window.setTimeout(() => {
    if (!isMouseOverSidebar.value && !isMouseOverContextMenu.value) {
      closeContextMenu();
    }
  }, 150); // 150ms transition grace period
}

function handleMouseLeaveSidebar() {
  isMouseOverSidebar.value = false;
  checkMouseLeave();
}

function handleMouseLeaveContextMenu() {
  isMouseOverContextMenu.value = false;
  checkMouseLeave();
}

function openContextMenu(event: MouseEvent) {
  if (showContextMenu.value) {
    showContextMenu.value = false;
    nextTick(() => {
      contextMenuPos.value = { x: event.clientX, y: event.clientY };
      showContextMenu.value = true;
      isMouseOverSidebar.value = true;
    });
  } else {
    contextMenuPos.value = { x: event.clientX, y: event.clientY };
    showContextMenu.value = true;
    isMouseOverSidebar.value = true;
  }
  
  if (leaveTimeout) {
    window.clearTimeout(leaveTimeout);
    leaveTimeout = null;
  }
}

function closeContextMenu() {
  showContextMenu.value = false;
  isMouseOverContextMenu.value = false;
  if (leaveTimeout) {
    window.clearTimeout(leaveTimeout);
    leaveTimeout = null;
  }
}

function triggerEdit() {
  closeContextMenu();
  ui.sidebarSettingsOpen = true;
}

onMounted(() => {
  window.addEventListener("click", closeContextMenu);
  window.addEventListener("contextmenu", closeContextMenu);
});
onUnmounted(() => {
  window.removeEventListener("click", closeContextMenu);
  window.removeEventListener("contextmenu", closeContextMenu);
});
</script>

<template>
  <aside 
    class="sidebar" 
    :class="{ 'sidebar--collapsed': ui.sidebarCollapsed }"
    @contextmenu.prevent.stop="openContextMenu($event)"
    @mouseenter="isMouseOverSidebar = true"
    @mouseleave="handleMouseLeaveSidebar"
  >
    <div class="sidebar__logo-wrap">
      <img src="/logo.png" alt="VK Music" class="sidebar__logo" />
      <div class="sidebar__logo-text-wrapper">
        <div class="sidebar__logo-text">VK&nbsp;Music</div>
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
        <SvgIcon :name="item.icon" class="sidebar__icon" width="20" height="20" />
        <span class="sidebar__label">{{ item.label }}</span>
      </RouterLink>
    </nav>

    <div class="sidebar__footer">
      <button class="sidebar__toggle" @click="ui.toggleSidebar()" :aria-label="ui.sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'" :title="ui.sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'">
        <SvgIcon :name="ui.sidebarCollapsed ? 'chevron_right' : 'chevron_left'" width="20" height="20" />
      </button>
    </div>

    <!-- Custom Right-Click Context Menu -->
    <Transition name="context-menu-fade">
      <div 
        v-if="showContextMenu" 
        class="sidebar__context-menu" 
        :style="{ top: `${contextMenuPos.y}px`, left: `${contextMenuPos.x}px` }"
        @click.stop
        @mouseenter="isMouseOverContextMenu = true"
        @mouseleave="handleMouseLeaveContextMenu"
      >
        <button class="sidebar__context-btn" @click="triggerEdit">
          <SvgIcon name="edit" width="14" height="14" style="margin-right: 8px;" />
          Редактировать
        </button>
      </div>
    </Transition>

    <!-- Sidebar Settings Modal -->
    <SidebarSettingsModal 
      :show="ui.sidebarSettingsOpen" 
      @close="ui.sidebarSettingsOpen = false" 
    />
  </aside>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 8px 14px 20px;
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
  transition: padding var(--motion-duration-slow) cubic-bezier(0.2, 0.8, 0.2, 1);
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
  font-size: calc(16px * var(--font-scale, 1));
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
  padding: 4px 8px 4px 4px;
  margin: -4px 0;
  border-radius: var(--radius-md);
  transition:
    background-color var(--motion-duration-fast) var(--motion-ease-out);
  background-color: transparent;
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
  font-size: calc(16px * var(--font-scale, 1));
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
  font-size: calc(14px * var(--font-scale, 1));
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
  padding: 10px 12px 10px 14px;
  border-radius: var(--radius-md);
  color: var(--text-1);
  font-weight: 500;
  font-size: calc(14px * var(--font-scale, 1));
  transition:
    background-color var(--motion-duration-fast) var(--motion-ease-out),
    color var(--motion-duration-fast) var(--motion-ease-out);
  background-color: transparent;
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  transition:
    background var(--motion-duration-base) var(--motion-ease-out),
    color var(--motion-duration-base) var(--motion-ease-out),
    transform var(--motion-duration-base) var(--motion-ease-out);
}
.sidebar__toggle:hover {
  background: var(--bg-2);
  color: var(--text-0);
  transform: scale(var(--motion-scale-hover));
}

.sidebar__context-menu {
  position: fixed;
  background: var(--bg-elev);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md, 8px);
  padding: 4px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  z-index: 3000;
  min-width: 150px;
}

.sidebar__context-btn {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--radius-sm, 6px);
  border: none;
  background: transparent;
  color: var(--text-0);
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s, color 0.2s;
}

.sidebar__context-btn:hover {
  background: var(--bg-3);
  color: var(--text-0);
}

/* Context Menu Fade Transition */
.context-menu-fade-enter-active,
.context-menu-fade-leave-active {
  transition: opacity 0.12s ease-out, transform 0.12s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.context-menu-fade-enter-from,
.context-menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.92) translateY(4px);
}
</style>
