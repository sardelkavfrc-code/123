<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import type { Track } from "@/api/types";

defineProps<{ show: boolean; tracks: Track[] }>();
const emit = defineEmits<{ 
  close: []; 
  delete: [track: Track];
  deleteAll: [];
}>();

const router = useRouter();
const isDeletingAll = ref(false);

async function handleDeleteAll() {
  if (confirm("Вы уверены, что хотите удалить ВСЕ недоступные треки из библиотеки?")) {
    isDeletingAll.value = true;
    try {
      emit('deleteAll');
    } finally {
      isDeletingAll.value = false;
    }
  }
}

function findAlternative(track: Track) {
  emit('close');
  router.push({ name: 'search', query: { q: `${track.artist} ${track.title}` } });
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <div class="modal-title-group">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h2>Недоступные треки ({{ tracks.length }})</h2>
          </div>
          <button class="modal-close" @click="emit('close')" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <div class="modal-warning">
            <svg class="modal-warning-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <span>Некоторые треки заблокированы в вашем регионе или изъяты правообладателем. Вы можете найти доступную версию через поиск или удалить их из библиотеки.</span>
          </div>

          <div class="tracks-list">
            <div v-for="track in tracks" :key="`${track.owner_id}_${track.id}`" class="track-item">
              <div class="track-info">
                <div class="track-title">{{ track.title }}</div>
                <div class="track-artist">{{ track.artist }}</div>
              </div>
              <div class="track-actions">
                <button class="btn-action" @click="findAlternative(track)" title="Найти доступную копию">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                </button>
                <button class="btn-action btn-action--danger" @click="emit('delete', track)" title="Удалить трек">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button 
            class="btn btn--danger" 
            :disabled="tracks.length === 0 || isDeletingAll" 
            @click="handleDeleteAll"
          >
            {{ isDeletingAll ? 'Удаление...' : 'Удалить все' }}
          </button>
          <button class="btn btn--primary" @click="emit('close')">Готово</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.modal-content {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
}
.modal-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-0);
}
.modal-title-group h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.modal-close {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-close:hover {
  color: var(--text-0);
  background: var(--bg-3);
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.modal-warning {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: 0;
  font-size: 13px;
  color: var(--text-1);
  line-height: 1.5;
  background: rgba(255, 171, 0, 0.08);
  padding: 14px 18px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 171, 0, 0.2);
}

.modal-warning-icon {
  flex-shrink: 0;
  color: #ffab00;
  margin-top: 2px;
}

.tracks-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.track-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg-2);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  transition: border-color 0.2s, background 0.2s;
}
.track-item:hover {
  border-color: var(--border-strong);
  background: var(--bg-3);
}

.track-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.track-title {
  color: var(--text-0);
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-artist {
  color: var(--text-2);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 12px;
}

.btn-action {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 8px;
  border-radius: var(--radius-sm);
  transition: color 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.btn-action:hover {
  color: var(--text-0);
  background: var(--bg-4);
}

.btn-action--danger:hover {
  color: #ff4757;
  background: rgba(255, 71, 87, 0.1);
}

.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-2);
}

.btn {
  background: var(--bg-3);
  border: none;
  color: var(--text-1);
  font-size: 14px;
  font-weight: 600;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
}
.btn:hover:not(:disabled) {
  background: var(--bg-4);
  color: var(--text-0);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--danger {
  color: #ff4757;
  background: rgba(255, 71, 87, 0.1);
}
.btn--danger:hover:not(:disabled) {
  background: #ff4757;
  color: #fff;
}

.btn--primary {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: #fff;
}
.btn--primary:hover:not(:disabled) {
  opacity: 0.9;
  color: #fff;
}

/* Modal Animations */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}
.modal-fade-enter-active .modal-content {
  animation: modal-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-fade-leave-active .modal-content {
  animation: modal-out 0.25s ease-in;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@keyframes modal-in {
  from {
    transform: translateY(20px) scale(0.95);
  }
  to {
    transform: translateY(0) scale(1);
  }
}
@keyframes modal-out {
  from {
    transform: translateY(0) scale(1);
  }
  to {
    transform: translateY(10px) scale(0.95);
  }
}
</style>
