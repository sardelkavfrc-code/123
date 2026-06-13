<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import TitleBar from "@/components/TitleBar.vue";
import Sidebar from "@/components/Sidebar.vue";
import PlayerBar from "@/components/PlayerBar.vue";
import ToastHost from "@/components/ToastHost.vue";
import UpdateNotification from "@/components/UpdateNotification.vue";
import DynamicBackground from "@/components/DynamicBackground.vue";
import { usePlayerStore } from "@/stores/player";
import { useSettingsStore } from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { useAuthStore } from "@/stores/auth";

const route = useRoute();
const router = useRouter();
const isBlank = computed(() => route.meta.layout === "blank");
const player = usePlayerStore();
const ui = useUIStore();

let detachMediaKey: (() => void) | null = null;

onMounted(() => {
  if (window.vkmp) {
    detachMediaKey = window.vkmp.onMediaKey((key) => {
      if (key === "play-pause") player.togglePlay();
      else if (key === "next") player.next();
      else if (key === "prev") player.prev();
    });

    const settings = useSettingsStore();
    if (settings.autoUpdateCheck) {
      window.vkmp.updater?.checkForUpdates().catch(() => {});
    }
    
    // Check every hour
    setInterval(() => {
      if (useSettingsStore().autoUpdateCheck) {
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
});

onUnmounted(() => {
  detachMediaKey?.();
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
        <transition name="page-fade" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </div>
    <div v-else class="app-grid">
      <Sidebar class="app-grid__sidebar" />
      <main class="app-grid__main">
        <router-view v-slot="{ Component }">
          <transition name="page-fade" mode="out-in">
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
}
.app-grid__update {
  grid-area: update;
}
.app-grid__player {
  grid-area: player;
}
</style>
