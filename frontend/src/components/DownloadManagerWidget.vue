<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useDownloadStore } from "@/stores/download";
import SvgIcon from "./SvgIcon.vue";

const downloadStore = useDownloadStore();

const containerRef = ref<HTMLElement | null>(null);

// Auto-scroll logic when expanded:
watch(
  () => downloadStore.isExpanded,
  async (expanded) => {
    if (expanded) {
      downloadStore.startPolling();
      await nextTick();
      if (containerRef.value) {
        const items = containerRef.value.querySelectorAll(".download-item");
        if (items.length > 0) {
          const lastActiveOrCompletedIdx = downloadStore.queue.reduce(
            (lastIdx, item, idx) => {
              if (item.status === "completed" || item.status === "downloading") {
                return idx;
              }
              return lastIdx;
            },
            -1
          );

          if (lastActiveOrCompletedIdx >= 0 && items[lastActiveOrCompletedIdx]) {
            items[lastActiveOrCompletedIdx].scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          } else {
            containerRef.value.scrollTop = containerRef.value.scrollHeight;
          }
        }
      }
    } else {
      if (downloadStore.activeCount === 0) {
        downloadStore.stopPolling();
      }
    }
  }
);
</script>

<template>
  <div v-if="downloadStore.totalCount > 0" class="download-manager">
    <!-- Floating Circular Action Button -->
    <button
      class="download-fab"
      :class="{ 'download-fab--active': downloadStore.activeCount > 0 }"
      @click="downloadStore.isExpanded = !downloadStore.isExpanded"
      title="Загрузки"
    >
      <div v-if="downloadStore.activeCount > 0" class="download-fab__badge">
        {{ downloadStore.activeCount }}
      </div>
      <SvgIcon name="download" width="22" height="22" />
    </button>

    <!-- Expanded Popup Card -->
    <Transition name="fade-scale">
      <div v-if="downloadStore.isExpanded" class="download-card">
        <div class="download-card__header">
          <h3>Загрузки</h3>
          <button
            class="download-card__close-btn"
            @click="downloadStore.isExpanded = false"
          >
            <SvgIcon name="cross" width="14" height="14" />
          </button>
        </div>

        <div ref="containerRef" class="download-card__list">
          <div
            v-for="item in downloadStore.queue"
            :key="`${item.owner_id}_${item.id}`"
            class="download-item"
            :class="`download-item--${item.status}`"
          >
            <div class="download-item__info">
              <div class="download-item__title" :title="item.title">
                {{ item.title }}
              </div>
              <div class="download-item__artist" :title="item.artist">
                {{ item.artist }}
              </div>
            </div>

            <div class="download-item__status-wrap">
              <!-- Cancel Button for pending or downloading -->
              <button
                v-if="item.status === 'pending' || item.status === 'downloading'"
                class="download-item__cancel-btn"
                @click="downloadStore.cancelDownload(item.id, item.owner_id)"
                title="Отменить"
              >
                <SvgIcon name="cross" width="12" height="12" />
              </button>

              <div v-else-if="item.status === 'completed'" class="download-item__success">
                <SvgIcon name="check" width="16" height="16" />
              </div>

              <div
                v-else-if="item.status === 'failed'"
                class="download-item__error"
                :title="item.error || 'Ошибка загрузки'"
              >
                Ошибка
              </div>
            </div>

            <!-- Progress bar -->
            <div
              v-if="item.status === 'downloading' || item.status === 'pending'"
              class="download-item__progress-bar"
            >
              <div
                class="download-item__progress-fill"
                :style="{ width: `${item.progress}%` }"
              ></div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.download-manager {
  position: fixed;
  bottom: calc(var(--player-height) + 24px);
  right: 24px;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.download-fab {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--bg-elev);
  border: 1px solid var(--border-strong);
  color: var(--text-0);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  position: relative;
  transition: transform var(--motion-duration-base) var(--motion-ease-out),
              background var(--motion-duration-base) var(--motion-ease-out);
}

.download-fab:hover {
  transform: scale(1.08);
  background: var(--bg-3);
}

.download-fab--active {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  border-color: transparent;
  color: var(--accent-text);
  animation: pulse-glow 2s infinite;
}

.download-fab--active:hover {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  opacity: 0.95;
}

.download-fab__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: var(--danger);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 10px;
  border: 2px solid var(--bg-0);
}

.download-card {
  width: 320px;
  max-height: 400px;
  background: var(--bg-elev-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.5);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUpFade 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.download-card__header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-weak);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.download-card__header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-0);
}

.download-card__close-btn {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background 0.2s, color 0.2s;
}

.download-card__close-btn:hover {
  background: var(--bg-3);
  color: var(--text-0);
}

.download-card__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.download-item {
  padding: 10px 16px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.download-item:last-child {
  border-bottom: none;
}

.download-item__info {
  flex: 1;
  min-width: 0;
}

.download-item__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.download-item__artist {
  font-size: 11px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}

.download-item__status-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.download-item__cancel-btn {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.download-item__cancel-btn:hover {
  background: rgba(255, 94, 126, 0.15);
  color: var(--danger);
}

.download-item__success {
  color: var(--accent-1);
}

.download-item__error {
  font-size: 11px;
  color: var(--danger);
  font-weight: 600;
  cursor: help;
}

.download-item__progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.05);
}

.download-item__progress-fill {
  height: 100%;
  background: var(--accent-1);
  transition: width 0.3s ease;
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.2s cubic-bezier(0.2, 0.8, 0.2, 1),
              transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(10px);
}

@keyframes pulse-glow {
  0% {
    box-shadow: 0 8px 24px rgba(62, 172, 255, 0.4);
  }
  50% {
    box-shadow: 0 8px 28px rgba(62, 172, 255, 0.7);
  }
  100% {
    box-shadow: 0 8px 24px rgba(62, 172, 255, 0.4);
  }
}

@keyframes slideUpFade {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
