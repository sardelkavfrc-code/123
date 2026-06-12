<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { usePlayerStore } from "@/stores/player";

type UpdateState = "hidden" | "available" | "downloading" | "ready" | "installing";

const state = ref<UpdateState>("hidden");
const releaseNotes = ref("");
const progress = ref(0);

const router = useRouter();
const player = usePlayerStore();

onMounted(() => {
  if (!window.vkmp?.updater) return;

  window.vkmp.updater.onUpdateAvailable((info: any) => {
    state.value = "available";
    // Usually info.releaseNotes contains the changelog (or info.readme)
    // Sometimes it's HTML, sometimes Markdown. We'll render it safely.
    if (info.releaseNotes) {
      if (typeof info.releaseNotes === "string") {
        releaseNotes.value = info.releaseNotes;
      } else if (Array.isArray(info.releaseNotes)) {
        releaseNotes.value = info.releaseNotes.map((n: any) => n.note).join("\n");
      }
    }
  });

  window.vkmp.updater.onUpdateProgress((prog: any) => {
    state.value = "downloading";
    progress.value = prog.percent || 0;
  });

  window.vkmp.updater.onUpdateReady(() => {
    state.value = "ready";
  });
});

function hide() {
  state.value = "hidden";
}

async function startDownload() {
  if (!window.vkmp?.updater) return;
  state.value = "downloading";
  await window.vkmp.updater.downloadUpdate();
}

function saveStateBeforeUpdate() {
  // Save track, time, queue, tab
  const data = {
    track: player.current,
    time: player.progress,
    queue: player.queue,
    playing: player.isPlaying,
    path: router.currentRoute.value.fullPath,
  };
  localStorage.setItem("vkmp:update_restore_state", JSON.stringify(data));
}

async function installAndRestart() {
  if (!window.vkmp?.updater) return;
  state.value = "installing";
  saveStateBeforeUpdate();
  await window.vkmp.updater.installUpdate();
}
</script>

<template>
  <div class="update-notification" v-if="state !== 'hidden'">
    <div class="update-notification__inner">
      <div class="update-notification__content">
        <div class="update-notification__header">
          <h3>Доступно обновление</h3>
          <button v-if="state === 'available'" class="btn-icon" @click="hide">×</button>
        </div>
        
        <div v-if="state === 'available'" class="update-notification__notes" v-html="releaseNotes || 'Улучшения стабильности и новые функции.'"></div>
        
        <div v-if="state === 'downloading'" class="update-notification__progress-wrap">
          <div class="update-notification__progress-bar">
            <div class="update-notification__progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
          <span class="update-notification__progress-text">{{ Math.round(progress) }}%</span>
        </div>

        <div v-if="state === 'installing'" class="update-notification__installing">
          <span class="loader"></span> Подготовка к установке...
        </div>
      </div>

      <div class="update-notification__actions">
        <template v-if="state === 'available'">
          <button class="btn btn--primary" @click="startDownload">Скачать</button>
          <button class="btn btn--ghost" @click="hide">Позже</button>
        </template>
        <template v-else-if="state === 'ready'">
          <button class="btn btn--primary" @click="installAndRestart">Установить и перезапустить</button>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.update-notification {
  background: var(--bg-2);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 12px 24px;
  color: var(--text-0);
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.1);
  z-index: 100;
}
.update-notification__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  max-width: 1200px;
  margin: 0 auto;
}
.update-notification__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.update-notification__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.update-notification__header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--accent-1);
}
.update-notification__notes {
  font-size: 13px;
  color: var(--text-1);
  max-height: 60px;
  overflow-y: auto;
  padding-right: 8px;
}
.update-notification__notes :deep(ul) {
  margin: 4px 0;
  padding-left: 18px;
}
.update-notification__notes :deep(p) {
  margin: 4px 0;
}
.update-notification__progress-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
}
.update-notification__progress-bar {
  flex: 1;
  height: 6px;
  background: var(--bg-3);
  border-radius: 3px;
  overflow: hidden;
}
.update-notification__progress-fill {
  height: 100%;
  background: var(--accent-1);
  transition: width 0.2s linear;
}
.update-notification__progress-text {
  font-size: 12px;
  color: var(--text-2);
  font-variant-numeric: tabular-nums;
  min-width: 32px;
  text-align: right;
}
.update-notification__actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.update-notification__installing {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-1);
}
.loader {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-bottom-color: var(--accent-1);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.btn-icon {
  background: transparent;
  border: none;
  color: var(--text-2);
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}
.btn-icon:hover {
  color: var(--text-0);
}
</style>
