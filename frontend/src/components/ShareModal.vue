<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useUIStore } from "@/stores/ui";
import { api } from "@/api/client";
import type { User } from "@/api/types";
import Spinner from "@/components/Spinner.vue";

const ui = useUIStore();

const friends = ref<User[]>([]);
const loadingFriends = ref(false);
const friendsError = ref<string | null>(null);
const searchFriendQuery = ref("");
const sendingShare = ref<number | null>(null); // holds peer_id of friend currently sending to

const track = computed(() => ui.activeShareTrack);
const playlist = computed(() => ui.activeSharePlaylist);

const isPlaylist = computed(() => !!playlist.value);
const titleText = computed(() => isPlaylist.value ? "Поделиться плейлистом" : "Поделиться треком");

const itemTitle = computed(() => {
  if (playlist.value) return playlist.value.title;
  if (track.value) return track.value.title;
  return "";
});

const itemSubtitle = computed(() => {
  if (playlist.value) return playlist.value.subtitle || "Плейлист VK";
  if (track.value) return track.value.artist;
  return "";
});

const shareLink = computed(() => {
  if (playlist.value) {
    const accessKeyStr = playlist.value.access_key ? `_${playlist.value.access_key}` : "";
    return `https://vk.com/music/playlist/${playlist.value.owner_id}_${playlist.value.id}${accessKeyStr}`;
  }
  if (track.value) {
    return `https://vk.com/audio${track.value.owner_id}_${track.value.id}`;
  }
  return "";
});

const shareAttachment = computed(() => {
  if (playlist.value) {
    const accessKeyStr = playlist.value.access_key ? `_${playlist.value.access_key}` : "";
    return `audio_playlist${playlist.value.owner_id}_${playlist.value.id}${accessKeyStr}`;
  }
  if (track.value) {
    return `audio${track.value.owner_id}_${track.value.id}`;
  }
  return "";
});

const filteredFriends = computed(() => {
  const query = searchFriendQuery.value.trim().toLowerCase();
  if (!query) return friends.value;
  return friends.value.filter(
    (f) =>
      `${f.first_name} ${f.last_name}`.toLowerCase().includes(query) ||
      f.first_name.toLowerCase().includes(query) ||
      f.last_name.toLowerCase().includes(query)
  );
});

// Load friends list when modal opens
watch(
  () => ui.shareModalOpen,
  async (open) => {
    if (open) {
      loadingFriends.value = true;
      friendsError.value = null;
      searchFriendQuery.value = "";
      try {
        const list = await api.friends({ only_with_audio: false });
        friends.value = list.items || [];
      } catch (err: any) {
        friendsError.value = err.message || "Не удалось загрузить друзей";
      } finally {
        loadingFriends.value = false;
      }
    }
  }
);

function handleClose() {
  ui.shareModalOpen = false;
  ui.activeShareTrack = null;
  ui.activeSharePlaylist = null;
}

async function copyLink() {
  if (!shareLink.value) return;
  try {
    await navigator.clipboard.writeText(shareLink.value);
    ui.notify("Ссылка скопирована в буфер обмена", "success");
  } catch (err) {
    ui.notify("Не удалось скопировать ссылку", "error");
  }
}

async function sendToFriend(friend: User) {
  if (sendingShare.value !== null) return;
  sendingShare.value = friend.id;
  try {
    await api.shareToPeer(friend.id, undefined, shareAttachment.value);
    ui.notify(`Отправлено другу ${friend.first_name} ${friend.last_name}`, "success");
  } catch (err: any) {
    ui.notify(err.message || "Не удалось отправить", "error");
  } finally {
    sendingShare.value = null;
  }
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="ui.shareModalOpen && (track || playlist)" class="share-overlay" @click="handleClose">
      <div class="share-modal" @click.stop>
        <!-- HEADER -->
        <div class="share-modal__header">
          <h3>{{ titleText }}</h3>
          <button class="share-modal__close" @click="handleClose">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- ITEM DETAILS -->
        <div class="share-modal__item-summary">
          <div class="share-modal__item-info">
            <span class="share-modal__item-title">{{ itemTitle }}</span>
            <span class="share-modal__item-subtitle">{{ itemSubtitle }}</span>
          </div>
        </div>

        <!-- SHARE ACTIONS -->
        <div class="share-modal__actions">
          <button class="btn btn--primary share-modal__copy-btn" @click="copyLink">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            Скопировать ссылку
          </button>
        </div>

        <!-- SEND TO FRIENDS SECTION -->
        <div class="share-modal__friends-section">
          <div class="share-modal__section-title">Отправить другу в VK</div>
          <input
            v-model="searchFriendQuery"
            type="text"
            class="share-modal__search"
            placeholder="Поиск по друзьям..."
          />

          <div class="share-modal__list-container">
            <div v-if="loadingFriends" class="share-modal__status">
              <Spinner :size="20" /> Загружаем друзей...
            </div>
            <div v-else-if="friendsError" class="share-modal__status error">
              {{ friendsError }}
            </div>
            <div v-else-if="!filteredFriends.length" class="share-modal__status">
              Ничего не найдено
            </div>
            <div v-else class="share-modal__list">
              <div
                v-for="friend in filteredFriends"
                :key="friend.id"
                class="share-modal__item"
                :class="{ 'share-modal__item--sending': sendingShare === friend.id }"
                @click="sendToFriend(friend)"
              >
                <img
                  :src="friend.photo || '/avatar-placeholder.png'"
                  class="share-modal__avatar"
                  alt="Friend photo"
                />
                <span class="share-modal__name">{{ friend.first_name }} {{ friend.last_name }}</span>
                
                <div v-if="sendingShare === friend.id" class="share-modal__sending-spinner">
                  <Spinner :size="16" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.share-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.share-modal {
  width: 100%;
  max-width: 440px;
  background: var(--bg-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
  animation: modalSlideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalSlideUp {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.share-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-2);
  flex-shrink: 0;
}

.share-modal__header h3 {
  margin: 0;
  font-size: calc(16px * var(--font-scale, 1));
  font-weight: 700;
  color: var(--text-0);
}

.share-modal__close {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s, color 0.2s;
}

.share-modal__close:hover {
  background: var(--bg-2);
  color: var(--text-0);
}

.share-modal__item-summary {
  padding: 16px 18px;
  background: var(--bg-2);
  border-bottom: 1px solid var(--border-2);
  flex-shrink: 0;
}

.share-modal__item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.share-modal__item-title {
  font-weight: 700;
  font-size: 15px;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.share-modal__item-subtitle {
  font-size: 13px;
  color: var(--text-2);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.share-modal__actions {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-weak, var(--border-2));
  flex-shrink: 0;
}

.share-modal__copy-btn {
  width: 100%;
  justify-content: center;
  padding: 10px;
  font-size: 14px;
}

.share-modal__friends-section {
  display: flex;
  flex-direction: column;
  padding: 14px 18px;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.share-modal__section-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-2);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.share-modal__search {
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-0);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
  flex-shrink: 0;
}

.share-modal__search:focus {
  border-color: var(--primary);
}

.share-modal__list-container {
  overflow-y: auto;
  flex: 1;
  background: var(--bg-3);
  border: 1px solid var(--border-2);
  border-radius: 8px;
  min-height: 150px;
}

.share-modal__status {
  padding: 30px 18px;
  text-align: center;
  color: var(--text-2);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.share-modal__status.error {
  color: var(--danger);
}

.share-modal__list {
  display: flex;
  flex-direction: column;
  padding: 6px;
}

.share-modal__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.share-modal__item:hover {
  background: var(--bg-2);
}

.share-modal__item--sending {
  pointer-events: none;
  opacity: 0.6;
}

.share-modal__avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.share-modal__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-0);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.share-modal__sending-spinner {
  flex-shrink: 0;
}

.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
