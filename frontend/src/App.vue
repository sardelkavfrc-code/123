<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import TitleBar from "@/components/TitleBar.vue";
import Sidebar from "@/components/Sidebar.vue";
import PlayerBar from "@/components/PlayerBar.vue";
import ToastHost from "@/components/ToastHost.vue";
import { usePlayerStore } from "@/stores/player";

const route = useRoute();
const isBlank = computed(() => route.meta.layout === "blank");
const player = usePlayerStore();

let detachMediaKey: (() => void) | null = null;

onMounted(() => {
  if (window.vkmp) {
    detachMediaKey = window.vkmp.onMediaKey((key) => {
      if (key === "play-pause") player.togglePlay();
      else if (key === "next") player.next();
      else if (key === "prev") player.prev();
    });
  }
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
  <div class="app-root" :class="{ blank: isBlank }">
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
  grid-template-columns: var(--sidebar-width) 1fr;
  grid-template-rows: 1fr var(--player-height);
  grid-template-areas:
    "sidebar main"
    "player player";
}
.app-grid__sidebar {
  grid-area: sidebar;
  min-height: 0;
}
.app-grid__main {
  grid-area: main;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.app-grid__player {
  grid-area: player;
}
</style>
