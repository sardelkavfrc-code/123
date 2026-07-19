<script setup lang="ts">
import { computed } from "vue";
import { useUIStore } from "@/stores/ui";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useDislikesStore } from "@/stores/dislikes";
import { useRouter } from "vue-router";
import SvgIcon from "@/components/SvgIcon.vue";

const ui = useUIStore();
const library = useLibraryStore();
const player = usePlayerStore();
const dislikes = useDislikesStore();
const router = useRouter();

defineEmits(['mouseenter', 'mouseleave']);

const track = computed(() => ui.activeContextMenuTrack);

const inLibrary = computed(() => {
  if (!track.value) return false;
  return library.isInLibrary(track.value);
});

const isDisliked = computed(() => {
  if (!track.value) return false;
  return dislikes.isDisliked(track.value);
});

async function toggleLibrary() {
  if (!track.value) return;
  const t = track.value;
  ui.trackContextMenuOpen = false;
  try {
    if (inLibrary.value) {
      await library.removeFromLibrary(t);
      ui.notify("Трек удален из библиотеки", "info");
    } else {
      await library.addToLibrary(t);
      ui.notify("Трек добавлен в библиотеку", "success");
    }
  } catch (err) {
    ui.notify("Ошибка при изменении библиотеки", "error");
  }
}

function uncensoredSearch() {
  if (!track.value) return;
  ui.trackContextMenuOpen = false;
  const t = track.value;
  const artist = t.main_artists?.[0]?.name || t.artist || "";
  const query = `${artist} ${t.title}`.trim();
  window.location.href = `/search?q=${encodeURIComponent(query)}&mode=any`;
}

function openSimilar() {
  if (!track.value) return;
  ui.trackContextMenuOpen = false;
  const t = track.value;
  router.push({
    name: "similar",
    params: { audioId: `${t.owner_id}_${t.id}` },
    query: {
      artist: t.artist || undefined,
      title: t.title || undefined,
    },
  });
}

function addToQueue() {
  if (!track.value) return;
  ui.trackContextMenuOpen = false;
  player.enqueueNext(track.value);
  ui.notify("Трек будет играть следующим", "success");
}

function triggerTrackEdit() {
  ui.trackContextMenuOpen = false;
  ui.trackSettingsOpen = true;
}

function toggleDislike() {
  if (!track.value) return;
  ui.trackContextMenuOpen = false;
  if (isDisliked.value) {
    dislikes.undislike(track.value);
    ui.notify("Дизлайк отменен", "info");
  } else {
    dislikes.dislike(track.value);
    ui.notify("Трек больше не будет попадаться", "info");
  }
}
</script>

<template>
  <Transition name="context-menu-fade">
    <div 
      v-if="ui.trackContextMenuOpen && track" 
      class="track-context-menu" 
      :style="{ top: `${ui.trackContextMenuPos.y}px`, left: `${ui.trackContextMenuPos.x}px` }"
      @click.stop
      @mouseenter="$emit('mouseenter', $event)"
      @mouseleave="$emit('mouseleave', $event)"
    >
      <template v-if="ui.activeContextMenuType === 'full'">
        <button class="track-context-btn" @click="toggleLibrary">
          <SvgIcon :name="inLibrary ? 'cross' : 'plus'" width="16" height="16" style="margin-right: 12px; opacity: 0.7;" />
          {{ inLibrary ? 'Удалить из библиотеки' : 'В библиотеку' }}
        </button>
        <button class="track-context-btn" @click="addToQueue">
          <SvgIcon name="queue_add" width="16" height="16" style="margin-right: 12px; opacity: 0.7;" />
          Слушать далее
        </button>
        <button class="track-context-btn" @click="openSimilar">
          <SvgIcon name="similar" width="16" height="16" style="margin-right: 12px; opacity: 0.7;" />
          Похожие
        </button>
        <button class="track-context-btn" @click="uncensoredSearch">
          <SvgIcon name="uncensored" width="16" height="16" style="margin-right: 12px; opacity: 0.7;" />
          Найти без цензуры
        </button>
        <button class="track-context-btn" @click="toggleDislike">
          <SvgIcon name="dislike" width="16" height="16" style="margin-right: 12px; opacity: 0.7;" />
          {{ isDisliked ? 'Отменить дизлайк' : 'Не нравится' }}
        </button>
      </template>

      <template v-if="ui.activeContextMenuType === 'edit_only'">
        <button class="track-context-btn" @click="triggerTrackEdit">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 12px; opacity: 0.7;">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Редактировать кнопки
        </button>
      </template>
    </div>
  </Transition>
</template>

<style scoped>
.track-context-divider {
  height: 1px;
  background: var(--border-2);
  margin: 4px 0;
}
.track-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-context-menu, var(--bg-1));
  border: 1px solid var(--border-2);
  border-radius: var(--radius-md);
  padding: 6px;
  min-width: 220px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05);
  display: flex;
  flex-direction: column;
  gap: 2px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
.track-context-btn {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-0);
  font-size: calc(14px * var(--font-scale, 1));
  cursor: pointer;
  text-align: left;
  transition: background var(--motion-duration-fast) var(--motion-ease-out);
}
.track-context-btn:hover {
  background: var(--bg-3);
}
.context-menu-fade-enter-active,
.context-menu-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
  transform-origin: top left;
}
.context-menu-fade-enter-from,
.context-menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
