<script setup lang="ts">
import { useSettingsStore } from "@/stores/settings";
import { storeToRefs } from "pinia";
import draggable from "vuedraggable";

defineProps<{ show: boolean }>();
const emit = defineEmits<{ close: [] }>();

const settings = useSettingsStore();
const { sidebarItems } = storeToRefs(settings);

const ALL_ITEMS_MAP: Record<string, { label: string; icon: string }> = {
  home: { label: "Главная", icon: "home" },
  library: { label: "Моя музыка", icon: "library" },
  friends: { label: "Друзья", icon: "friends" },
  search: { label: "Поиск", icon: "search" },
  queue: { label: "Очередь", icon: "queue" },
  settings: { label: "Настройки", icon: "settings" },
};

function resetDefaults() {
  sidebarItems.value = [
    { id: "home", visible: true },
    { id: "library", visible: true },
    { id: "friends", visible: true },
    { id: "search", visible: true },
    { id: "queue", visible: true },
    { id: "settings", visible: true },
  ];
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="sidebar-settings-overlay" @click.self="emit('close')">
      <div class="sidebar-settings-modal" @click.stop>
        <div class="sidebar-settings-modal__header">
          <div class="sidebar-settings-modal__title-group">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
            </svg>
            <h2>Настройка вкладок</h2>
          </div>
          <button class="sidebar-settings-modal__close-btn" @click="emit('close')" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="sidebar-settings-modal__body">
          <p class="sidebar-settings-modal__desc">
            Перетаскивайте элементы для изменения порядка вкладок в меню. Снимите галочку, чтобы скрыть вкладку из сайдбара.
          </p>

          <draggable
            v-model="sidebarItems"
            item-key="id"
            handle=".sidebar-settings-modal__drag-handle"
            class="sidebar-settings-modal__list"
            ghost-class="sidebar-settings-modal__item--ghost"
            tag="ul"
          >
            <template #item="{ element }">
              <li class="sidebar-settings-modal__item">
                <button class="sidebar-settings-modal__drag-handle" title="Перетащить вкладку">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" />
                    <circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />
                  </svg>
                </button>
                
                <div class="sidebar-settings-modal__item-content">
                  <span class="sidebar-settings-modal__icon" :data-icon="ALL_ITEMS_MAP[element.id]?.icon || 'home'" />
                  <span class="sidebar-settings-modal__label">{{ ALL_ITEMS_MAP[element.id]?.label || element.id }}</span>
                </div>

                <label class="sidebar-settings-modal__visibility-toggle">
                  <input type="checkbox" v-model="element.visible" class="sidebar-settings-modal__checkbox" />
                  <span class="sidebar-settings-modal__checkbox-custom"></span>
                </label>
              </li>
            </template>
          </draggable>
        </div>

        <div class="sidebar-settings-modal__footer">
          <button class="sidebar-settings-modal__reset-btn" @click="resetDefaults">
            Сбросить
          </button>
          <button class="btn btn--primary" @click="emit('close')">
            Готово
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sidebar-settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.sidebar-settings-modal {
  background: var(--bg-elev);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg, 16px);
  width: 100%;
  max-width: 380px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.sidebar-settings-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.sidebar-settings-modal__title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-0);
}

.sidebar-settings-modal__title-group h2 {
  margin: 0;
  font-size: calc(16px * var(--font-scale, 1));
  font-weight: 700;
}

.sidebar-settings-modal__close-btn {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  transition: background 0.2s, color 0.2s;
}

.sidebar-settings-modal__close-btn:hover {
  background: var(--bg-3);
  color: var(--text-0);
}

.sidebar-settings-modal__body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 420px;
  overflow-y: auto;
}

.sidebar-settings-modal__desc {
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
  line-height: 1.4;
  margin: 0;
}

.sidebar-settings-modal__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-settings-modal__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  transition: background-color 0.2s, border-color 0.2s;
}

.sidebar-settings-modal__item:hover {
  background: var(--bg-3);
  border-color: var(--border-strong);
}

.sidebar-settings-modal__item--ghost {
  opacity: 0.4;
  background: var(--bg-4) !important;
}

.sidebar-settings-modal__drag-handle {
  background: transparent;
  border: none;
  color: var(--text-3);
  cursor: grab;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: color 0.2s;
}

.sidebar-settings-modal__drag-handle:hover {
  color: var(--text-1);
}

.sidebar-settings-modal__drag-handle:active {
  cursor: grabbing;
}

.sidebar-settings-modal__item-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  margin-left: 4px;
}

.sidebar-settings-modal__icon {
  width: 18px;
  height: 18px;
  background: currentColor;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  mask-size: contain;
  color: var(--text-1);
}

.sidebar-settings-modal__icon[data-icon="home"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/%3E%3Cpolyline points='9 22 9 12 15 12 15 22'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/%3E%3Cpolyline points='9 22 9 12 15 12 15 22'/%3E%3C/svg%3E");
}
.sidebar-settings-modal__icon[data-icon="library"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18V5l12-2v13'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Ccircle cx='18' cy='16' r='3'/%3E%3C/svg%3E");
}
.sidebar-settings-modal__icon[data-icon="friends"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E");
}
.sidebar-settings-modal__icon[data-icon="search"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E");
}
.sidebar-settings-modal__icon[data-icon="queue"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15V6'/%3E%3Cpath d='M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'/%3E%3Cpath d='M12 12H3'/%3E%3Cpath d='M16 6H3'/%3E%3Cpath d='M12 18H3'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15V6'/%3E%3Cpath d='M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'/%3E%3Cpath d='M12 12H3'/%3E%3Cpath d='M16 6H3'/%3E%3Cpath d='M12 18H3'/%3E%3C/svg%3E");
}
.sidebar-settings-modal__icon[data-icon="settings"] {
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'/%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3C/svg%3E");
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'/%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3C/svg%3E");
}

.sidebar-settings-modal__label {
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 500;
  color: var(--text-0);
}

.sidebar-settings-modal__visibility-toggle {
  position: relative;
  width: 20px;
  height: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-settings-modal__checkbox {
  opacity: 0;
  position: absolute;
  width: 0;
  height: 0;
}

.sidebar-settings-modal__checkbox-custom {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--bg-4);
  border: 1px solid var(--border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, border-color 0.2s;
}

.sidebar-settings-modal__checkbox:checked + .sidebar-settings-modal__checkbox-custom {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  border-color: transparent;
}

.sidebar-settings-modal__checkbox-custom::after {
  content: "";
  width: 5px;
  height: 9px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) scale(0);
  transition: transform 0.2s;
  margin-top: -2px;
}

.sidebar-settings-modal__checkbox:checked + .sidebar-settings-modal__checkbox-custom::after {
  transform: rotate(45deg) scale(1);
}

.sidebar-settings-modal__footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.sidebar-settings-modal__reset-btn {
  background: transparent;
  border: none;
  color: var(--text-2);
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 600;
  cursor: pointer;
  transition: color 0.2s;
  padding: 6px 12px;
  border-radius: 6px;
}

.sidebar-settings-modal__reset-btn:hover {
  color: var(--text-0);
  background: var(--bg-2);
}

/* Transitions & Keyframes */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@keyframes modal-in {
  from {
    transform: translateY(15px) scale(0.96);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
</style>
