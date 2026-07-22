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
  <Transition name="slide-up">
    <div v-if="downloadStore.showWidget && downloadStore.totalCount > 0" class="download-manager">
    <!-- Invisible overlay to close on click outside -->
    <div
      v-if="downloadStore.isExpanded"
      class="download-widget__overlay"
      @click="downloadStore.isExpanded = false"
    ></div>

    <div
      class="download-widget"
      :class="{
        'download-widget--expanded': downloadStore.isExpanded,
        'download-widget--collapsed': !downloadStore.isExpanded,
        'download-widget--active': downloadStore.activeCount > 0 && !downloadStore.isExpanded
      }"
      @click="!downloadStore.isExpanded && (downloadStore.isExpanded = true)"
    >
      <!-- Gradient pseudo-element for smooth transition -->
      <div class="download-widget__bg" :class="{ 'is-active': downloadStore.activeCount > 0 && !downloadStore.isExpanded }"></div>

      <!-- Collapsed FAB Content -->
      <div class="download-widget__fab-content" :class="{ 'is-hidden': downloadStore.isExpanded }">
        <SvgIcon name="download" width="22" height="22" />
      </div>

      <!-- Expanded Card Content -->
      <div class="download-widget__card-content" :class="{ 'is-visible': downloadStore.isExpanded }">
        <div class="download-card__header">
          <div class="download-card__title">
            <h3>Загрузки</h3>
            <span v-if="downloadStore.activeCount > 0" class="download-card__badge">{{ downloadStore.activeCount }}</span>
          </div>
          
          <div class="download-card__actions">
            <button
              v-if="downloadStore.activeCount > 0"
              class="download-card__cancel-all"
              @click.stop="downloadStore.cancelAllDownloads()"
              title="Отменить всё"
            >
              Отменить всё
            </button>
            <button
              class="download-card__close-btn"
              @click.stop="downloadStore.isExpanded = false"
            >
              <SvgIcon name="cross" width="14" height="14" />
            </button>
          </div>
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
              <button
                v-if="item.status === 'pending' || item.status === 'downloading'"
                class="download-item__cancel-btn"
                @click.stop="downloadStore.cancelDownload(item.id, item.owner_id)"
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
    </div>
    <!-- External badge to avoid clipping when overflow is hidden on widget -->
    <Transition name="fade">
      <div v-if="!downloadStore.isExpanded && downloadStore.activeCount > 0" class="download-fab__ext-badge">
        {{ downloadStore.activeCount }}
      </div>
    </Transition>
  </div>
  </Transition>
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

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.32, 0.72, 0, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(20px);
}

.download-widget__overlay {
  position: fixed;
  inset: 0;
  z-index: -1; /* Place behind the widget but cover everything else */
  cursor: default;
}

.download-widget {
  position: relative;
  z-index: 1;
  background: var(--bg-elev-glass);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  /* Smoother transition instead of heavy spring bounce */
  transition: width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1),
              height 0.4s cubic-bezier(0.2, 0.8, 0.2, 1),
              border-radius 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.download-widget__bg {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  opacity: 0;
  transition: opacity 0.4s ease;
  z-index: 0;
  pointer-events: none;
}

.download-widget__bg.is-active {
  opacity: 1;
}

/* Collapsed State (FAB) */
.download-widget--collapsed {
  width: 52px;
  height: 52px;
  border-radius: 26px;
  cursor: pointer;
}

.download-widget--collapsed:hover {
  background: var(--bg-3);
}

.download-widget--active {
  border-color: transparent;
  color: var(--accent-text);
  animation: pulse-glow 2s infinite;
}

.download-widget--active:hover {
  opacity: 0.95;
}

/* Expanded State (Card) */
.download-widget--expanded {
  width: 340px;
  height: 440px;
  border-radius: var(--radius-lg, 16px);
  cursor: default;
}

/* FAB Content (Icon & Badge) */
.download-widget__fab-content {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s ease, transform 0.2s ease;
  opacity: 1;
  pointer-events: none;
  z-index: 1;
}

.download-widget__fab-content.is-hidden {
  opacity: 0;
  transform: scale(0.5);
}

.download-fab__ext-badge {
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
  z-index: 10;
  pointer-events: none;
}

/* Card Content (Header & List) */
.download-widget__card-content {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  transition: opacity 0.3s ease 0.1s, transform 0.3s ease 0.1s;
  opacity: 0;
  pointer-events: none;
  transform: translateY(10px);
}

.download-widget__card-content.is-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.download-card__header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-weak);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.download-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-card__header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--text-0);
}

.download-card__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-card__cancel-all {
  background: rgba(255, 94, 126, 0.1);
  color: var(--danger);
  border: none;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.download-card__cancel-all:hover {
  background: rgba(255, 94, 126, 0.2);
}

.download-card__badge {
  background: var(--danger);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 10px;
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
</style>
