<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import TitleBar from "@/components/TitleBar.vue";
import Sidebar from "@/components/Sidebar.vue";
import PlayerBar from "@/components/PlayerBar.vue";
import ToastHost from "@/components/ToastHost.vue";
import UpdateNotification from "@/components/UpdateNotification.vue";
import DynamicBackground from "@/components/DynamicBackground.vue";
import TrackSettingsModal from "@/components/TrackSettingsModal.vue";
import TrackContextMenu from "@/components/TrackContextMenu.vue";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";
import { useLibraryStore } from "@/stores/library";

const route = useRoute();
const router = useRouter();
const isBlank = computed(() => route.meta.layout === "blank");
const player = usePlayerStore();
const ui = useUIStore();
const auth = useAuthStore();
const library = useLibraryStore();
const settings = useSettingsStore();

watch(
  () => auth.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      void library.loadAllMyMusic();
    } else {
      library.reset();
    }
  },
  { immediate: true }
);

let detachMediaKey: (() => void) | null = null;



const isMouseOverTrackContextMenu = ref(false);
let trackLeaveTimeout: number | null = null;

function checkTrackMouseLeave() {
  if (trackLeaveTimeout) window.clearTimeout(trackLeaveTimeout);
  trackLeaveTimeout = window.setTimeout(() => {
    const isOverActiveTrack = ui.activeContextMenuTrack && ui.hoveredTrackKey === `${ui.activeContextMenuTrack.owner_id}_${ui.activeContextMenuTrack.id}`;
    if (!isOverActiveTrack && !isMouseOverTrackContextMenu.value) {
      ui.trackContextMenuOpen = false;
    }
  }, 150);
}

function handleMouseLeaveTrackContextMenu() {
  isMouseOverTrackContextMenu.value = false;
  checkTrackMouseLeave();
}

watch(() => ui.hoveredTrackKey, (newVal) => {
  if (!ui.activeContextMenuTrack || newVal !== `${ui.activeContextMenuTrack.owner_id}_${ui.activeContextMenuTrack.id}`) {
    checkTrackMouseLeave();
  } else {
    if (trackLeaveTimeout) {
      window.clearTimeout(trackLeaveTimeout);
      trackLeaveTimeout = null;
    }
  }
});

// We no longer force isMouseOverTrackContextMenu = true here.
// The actual mouseenter event on the menu element will set it to true.
watch(() => ui.trackContextMenuOpen, (isOpen) => {
  if (isOpen) {
    if (trackLeaveTimeout) {
      window.clearTimeout(trackLeaveTimeout);
      trackLeaveTimeout = null;
    }
  } else {
    ui.activeContextMenuTrack = null;
    isMouseOverTrackContextMenu.value = false;
  }
});

function closeTrackContextMenu() {
  ui.trackContextMenuOpen = false;
  isMouseOverTrackContextMenu.value = false;
  if (trackLeaveTimeout) {
    window.clearTimeout(trackLeaveTimeout);
    trackLeaveTimeout = null;
  }
}

onMounted(() => {
  if (window.vkmp) {
    detachMediaKey = window.vkmp.onMediaKey((key) => {
      if (key === "play-pause") player.togglePlay();
      else if (key === "next") player.next();
      else if (key === "prev") player.prev();
    });

    if (settings.autoUpdateCheck) {
      setTimeout(() => {
        window.vkmp?.updater?.checkForUpdates().catch((err) => {
          console.error("Auto update check failed:", err);
        });
      }, 3000);
    }
    
    // Check every hour
    setInterval(() => {
      if (settings.autoUpdateCheck) {
        window.vkmp?.updater?.checkForUpdates().catch(() => {});
      }
    }, 1000 * 60 * 60);
  }

  // Restore state after update
  const unwatch = watch(() => useAuthStore().checked, (isChecked) => {
    if (isChecked) {
      unwatch();
      try {
        const rawState = localStorage.getItem("vkmp:update_restore_state");
        if (rawState) {
          localStorage.removeItem("vkmp:update_restore_state");
          const state = JSON.parse(rawState);
          if (state.queue && state.track) {
            const idx = state.queue.findIndex((t: any) => t.id === state.track.id);
            player.playQueue(state.queue, idx >= 0 ? idx : 0, {
              autoPlay: state.playing,
              startTime: state.time || 0,
            });
          }
          if (state.path) {
            router.push(state.path);
          }
        }
      } catch (err) {
        console.error("Failed to restore update state", err);
      }
    }
  }, { immediate: true });

  window.addEventListener("click", closeTrackContextMenu);
  window.addEventListener("contextmenu", closeTrackContextMenu);
});

onUnmounted(() => {
  detachMediaKey?.();
  window.removeEventListener("click", closeTrackContextMenu);
  window.removeEventListener("contextmenu", closeTrackContextMenu);
});

watch(
  () => [player.current, player.isPlaying] as const,
  ([track, playing]) => {
    if (!window.vkmp) return;
    if (!track) {
      window.vkmp.setTrayInfo(null);
      return;
    }
    window.vkmp.setTrayInfo({
      title: track.title,
      artist: track.artist,
      isPlaying: playing,
    });
  }
);
</script>

<template>
  <div class="app-root" :class="{ blank: isBlank, 'app-root--collapsed': ui.sidebarCollapsed }">
    <DynamicBackground />
    <TitleBar />
    <div v-if="isBlank" class="blank-host">
      <router-view v-slot="{ Component }">
        <transition :name="settings.routerAnimation === 'none' ? '' : `page-${settings.routerAnimation}`" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
    <div v-else class="app-grid">
      <Sidebar class="app-grid__sidebar" />
      <main class="app-grid__main">
        <router-view v-slot="{ Component }">
          <transition :name="settings.routerAnimation === 'none' ? '' : `page-${settings.routerAnimation}`" mode="out-in">
            <keep-alive>
              <component :is="Component" />
            </keep-alive>
          </transition>
        </router-view>
      </main>
      <UpdateNotification class="app-grid__update" />
      <PlayerBar class="app-grid__player" />
    </div>
    <ToastHost />

    <!-- Global Track Context Menu -->
    <TrackContextMenu 
      @mouseenter="isMouseOverTrackContextMenu = true"
      @mouseleave="handleMouseLeaveTrackContextMenu"
    />

    <TrackSettingsModal 
      :show="ui.trackSettingsOpen" 
      @close="ui.trackSettingsOpen = false" 
    />
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.blank-host {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
}
.app-grid {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr auto var(--player-height);
  grid-template-areas:
    "sidebar main"
    "update update"
    "player player";
}
.app-grid__sidebar {
  grid-area: sidebar;
  min-height: 0;
  width: 240px;
  transition: width var(--motion-duration-slow) cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: width;
}
.app-root--collapsed .app-grid__sidebar {
  width: 76px;
}
.app-grid__main {
  grid-area: main;
  min-height: 0;
  overflow: hidden;
  position: relative;
  contain: layout;
}
.app-grid__update {
  grid-area: update;
}
.app-grid__player {
  grid-area: player;
}

.track-context-menu {
  position: fixed;
  background: var(--bg-elev);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md, 8px);
  padding: 4px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  z-index: 3000;
  min-width: 175px;
}

.track-context-btn {
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

.track-context-btn:hover {
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
