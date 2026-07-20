<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import { useUIStore } from "@/stores/ui";
import { useLibraryStore } from "@/stores/library";
import { usePlayerStore } from "@/stores/player";
import { useDislikesStore } from "@/stores/dislikes";
import { useAuthStore } from "@/stores/auth";
import { useRouter } from "vue-router";
import SvgIcon from "@/components/SvgIcon.vue";

const ui = useUIStore();
const library = useLibraryStore();
const player = usePlayerStore();
const dislikes = useDislikesStore();
const auth = useAuthStore();
const router = useRouter();

const canRemoveFromPlaylist = computed(() => {
  if (!player.currentPlaylist || !track.value) return false;
  return player.currentPlaylist.owner_id === auth.status.user_id;
});

async function removeFromPlaylist() {
  if (!track.value || !player.currentPlaylist) return;
  const t = track.value;
  const pl = player.currentPlaylist;
  ui.trackContextMenuOpen = false;
  try {
    await library.removeTrackFromPlaylist(pl, t);
    player.removeTrack(t);
    ui.notify("Трек удален из плейлиста", "success");
  } catch (err: any) {
    ui.notify(err.message || "Не удалось удалить трек", "error");
  }
}

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

function showAddToPlaylistModal() {
  if (!track.value) return;
  ui.trackContextMenuOpen = false;
  ui.activePlaylistTrack = track.value;
  ui.addToPlaylistModalOpen = true;
  void library.loadMyPlaylists();
}

function shareTrack() {
  if (!track.value) return;
  ui.trackContextMenuOpen = false;
  ui.activeShareTrack = track.value;
  ui.shareModalOpen = true;
}

const menuRef = ref<HTMLElement | null>(null);

const stylePosition = ref({
  top: "0px",
  left: "0px",
  transformOrigin: "top left",
});

watch(
  () => [ui.trackContextMenuOpen, ui.trackContextMenuPos.x, ui.trackContextMenuPos.y] as const,
  async ([open, x, y]) => {
    if (!open) return;
    
    // Set initial position
    stylePosition.value = {
      top: `${y}px`,
      left: `${x}px`,
      transformOrigin: "top left",
    };
    
    await nextTick();
    if (!menuRef.value) return;
    
    const menuEl = menuRef.value;
    const rect = menuEl.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    
    let adjustedX = x;
    let adjustedY = y;
    let originX = "left";
    let originY = "top";
    
    if (x + rect.width > winWidth) {
      adjustedX = x - rect.width;
      originX = "right";
    }
    if (y + rect.height > winHeight) {
      adjustedY = y - rect.height;
      originY = "bottom";
    }
    
    if (adjustedX < 0) adjustedX = 0;
    if (adjustedY < 0) adjustedY = 0;
    
    stylePosition.value = {
      top: `${adjustedY}px`,
      left: `${adjustedX}px`,
      transformOrigin: `${originY} ${originX}`,
    };
  }
);
</script>

<template>
  <Transition name="context-menu-fade">
    <div 
      v-if="ui.trackContextMenuOpen && track" 
      ref="menuRef"
      class="track-context-menu" 
      :style="stylePosition"
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
        <button class="track-context-btn" @click="showAddToPlaylistModal">
          <SvgIcon name="plus" width="16" height="16" style="margin-right: 12px; opacity: 0.7;" />
          Добавить в плейлист...
        </button>
        <button v-if="canRemoveFromPlaylist" class="track-context-btn" @click="removeFromPlaylist">
          <SvgIcon name="cross" width="16" height="16" style="margin-right: 12px; opacity: 0.7;" />
          Удалить из плейлиста
        </button>
        <button class="track-context-btn" @click="shareTrack">
          <SvgIcon name="share" width="16" height="16" style="margin-right: 12px; opacity: 0.7;" />
          Поделиться...
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
        <button class="track-context-btn" @click="shareTrack">
          <SvgIcon name="share" width="16" height="16" style="margin-right: 12px; opacity: 0.7;" />
          Поделиться...
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
}
.context-menu-fade-enter-from,
.context-menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
