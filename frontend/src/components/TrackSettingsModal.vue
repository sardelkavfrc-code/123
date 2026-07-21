<script setup lang="ts">
import { useSettingsStore } from "@/stores/settings";
import { storeToRefs } from "pinia";
import draggable from "vuedraggable";
import SvgIcon from "./SvgIcon.vue";
import type { IconName } from "@/utils/icons";

defineProps<{ show: boolean }>();
const emit = defineEmits<{ close: [] }>();

const settings = useSettingsStore();
const { trackItems } = storeToRefs(settings);

const ALL_ITEMS_MAP: Record<string, { label: string; icon: IconName }> = {
  library: { label: "Добавить в библиотеку / Удалить", icon: "library" },
  uncensored: { label: "Без цензуры (Найти оригинал)", icon: "uncensored" },
  similar: { label: "Похожие треки", icon: "similar" },
  queue: { label: "Слушать далее (Добавить в очередь)", icon: "queue" },
  share: { label: "Поделиться треком", icon: "share" },
  dislike: { label: "Не нравится", icon: "dislike" },
};

function resetDefaults() {
  trackItems.value = [
    { id: "library", visible: true },
    { id: "uncensored", visible: true },
    { id: "similar", visible: true },
    { id: "queue", visible: true },
    { id: "share", visible: true },
    { id: "dislike", visible: true },
  ];
}
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="track-settings-overlay" @click.self="emit('close')">
      <div class="track-settings-modal" @click.stop>
        <div class="track-settings-modal__header">
          <div class="track-settings-modal__title-group">
            <SvgIcon name="edit" width="20" height="20" />
            <h2>Кнопки действий треков</h2>
          </div>
          <button class="track-settings-modal__close-btn" @click="emit('close')" aria-label="Закрыть">
            <SvgIcon name="cross" width="18" height="18" />
          </button>
        </div>

        <div class="track-settings-modal__body">
          <p class="track-settings-modal__desc">
            Перетаскивайте элементы, чтобы изменить порядок кнопок действий в строках треков. Снимите галочку, чтобы скрыть кнопку.
          </p>

          <draggable
            v-model="trackItems"
            item-key="id"
            handle=".track-settings-modal__drag-handle"
            class="track-settings-modal__list"
            ghost-class="track-settings-modal__item--ghost"
            tag="ul"
          >
            <template #item="{ element }">
              <li class="track-settings-modal__item">
                <button class="track-settings-modal__drag-handle" title="Перетащить кнопку">
                  <SvgIcon name="drag_handle" width="16" height="16" />
                </button>
                
                <div class="track-settings-modal__item-content">
                  <SvgIcon :name="ALL_ITEMS_MAP[element.id]?.icon || 'library'" class="track-settings-modal__icon" width="18" height="18" />
                  <span class="track-settings-modal__label">{{ ALL_ITEMS_MAP[element.id]?.label || element.id }}</span>
                </div>

                <label class="track-settings-modal__visibility-toggle">
                  <input type="checkbox" v-model="element.visible" class="track-settings-modal__checkbox" />
                  <span class="track-settings-modal__checkbox-custom"></span>
                </label>
              </li>
            </template>
          </draggable>
        </div>

        <div class="track-settings-modal__footer">
          <button class="track-settings-modal__reset-btn" @click="resetDefaults">
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
.track-settings-overlay {
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

.track-settings-modal {
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

.track-settings-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.track-settings-modal__title-group {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-0);
}

.track-settings-modal__title-group h2 {
  margin: 0;
  font-size: calc(16px * var(--font-scale, 1));
  font-weight: 700;
}

.track-settings-modal__close-btn {
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

.track-settings-modal__close-btn:hover {
  background: var(--bg-3);
  color: var(--text-0);
}

.track-settings-modal__body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 420px;
  overflow-y: auto;
}

.track-settings-modal__desc {
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
  line-height: 1.4;
  margin: 0;
}

.track-settings-modal__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.track-settings-modal__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md, 8px);
  transition: background-color 0.2s, border-color 0.2s;
}

.track-settings-modal__item:hover {
  background: var(--bg-3);
  border-color: var(--border-strong);
}

.track-settings-modal__item--ghost {
  opacity: 0.4;
  background: var(--bg-4) !important;
}

.track-settings-modal__drag-handle {
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

.track-settings-modal__drag-handle:hover {
  color: var(--text-1);
}

.track-settings-modal__drag-handle:active {
  cursor: grabbing;
}

.track-settings-modal__item-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  margin-left: 4px;
}

.track-settings-modal__icon {
  width: 18px;
  height: 18px;
  color: var(--text-1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.track-settings-modal__label {
  font-size: calc(13px * var(--font-scale, 1));
  font-weight: 500;
  color: var(--text-0);
}

.track-settings-modal__visibility-toggle {
  position: relative;
  width: 20px;
  height: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.track-settings-modal__checkbox {
  opacity: 0;
  position: absolute;
  width: 0;
  height: 0;
}

.track-settings-modal__checkbox-custom {
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

.track-settings-modal__checkbox:checked + .track-settings-modal__checkbox-custom {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  border-color: transparent;
}

.track-settings-modal__checkbox-custom::after {
  content: "";
  width: 5px;
  height: 9px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg) scale(0);
  transition: transform 0.2s;
  margin-top: -2px;
}

.track-settings-modal__checkbox:checked + .track-settings-modal__checkbox-custom::after {
  transform: rotate(45deg) scale(1);
}

.track-settings-modal__footer {
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.track-settings-modal__reset-btn {
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

.track-settings-modal__reset-btn:hover {
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
