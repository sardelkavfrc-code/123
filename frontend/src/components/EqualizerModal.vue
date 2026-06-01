<script setup lang="ts">
import { useEqualizerStore } from "@/stores/equalizer";
import { storeToRefs } from "pinia";
import { computed, ref, nextTick } from "vue";

defineProps<{ show: boolean }>();
const emit = defineEmits<{ close: [] }>();

const eq = useEqualizerStore();
const { enabled, selectedPreset, customBands, userPresets } = storeToRefs(eq);
const { PRESETS, FREQUENCIES } = eq;

const isCustom = computed(() => selectedPreset.value === "Кастомный");
const isSaving = ref(false);
const saveName = ref("");
const saveInputRef = ref<HTMLInputElement | null>(null);

function onBandChange(index: number, event: Event) {
  const input = event.target as HTMLInputElement;
  eq.setBandGain(index, parseFloat(input.value));
}

function selectPreset(name: string) {
  eq.setPreset(name);
}

function reset() {
  eq.resetBands();
}



async function startSave() {
  isSaving.value = true;
  saveName.value = "";
  await nextTick();
  if (saveInputRef.value) {
    saveInputRef.value.focus();
  }
}

function commitSave() {
  if (saveName.value.trim()) {
    eq.saveUserPreset(saveName.value.trim());
  }
  isSaving.value = false;
  saveName.value = "";
}

function deletePreset(name: string) {
  if (confirm(`Удалить пользовательский пресет "${name}"?`)) {
    eq.deleteUserPreset(name);
  }
}

// Convert frequencies like 1000 to "1k"
function formatHz(hz: number) {
  if (hz >= 1000) return `${hz / 1000}k`;
  return String(hz);
}

function getFillPct(gain: number) {
  return ((gain + 12) / 24) * 100;
}

// Current active values for the sliders
const activeGains = computed(() => {
  if (isCustom.value) return customBands.value;
  const preset = PRESETS.find(p => p.name === selectedPreset.value) || userPresets.value.find(p => p.name === selectedPreset.value);
  return preset ? preset.bands : customBands.value; // fallback
});
</script>

<template>
  <Transition name="eq-fade">
    <div v-if="show" class="eq-overlay" @click.self="emit('close')">
      <div class="eq-modal" @click.stop>
        <div class="eq-modal__header">
        <div class="eq-modal__title-group">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 22v-8M4 10V2M12 22v-4M12 14V2M20 22v-12M20 6V2" />
            <line x1="2" y1="14" x2="6" y2="14" />
            <line x1="10" y1="18" x2="14" y2="18" />
            <line x1="18" y1="10" x2="22" y2="10" />
          </svg>
          <h2>Эквалайзер</h2>
        </div>
        
        <label class="eq-switch">
          <input type="checkbox" v-model="enabled" />
          <span class="eq-switch__slider"></span>
        </label>
      </div>

      <div class="eq-modal__body" :class="{ 'eq-modal__body--disabled': !enabled }">
        <div class="eq-presets">
          <button 
            v-for="p in PRESETS" 
            :key="p.name"
            class="eq-preset-btn"
            :class="{ 'eq-preset-btn--active': selectedPreset === p.name }"
            @click="selectPreset(p.name)"
          >
            {{ p.name }}
          </button>
          <button 
            class="eq-preset-btn"
            :class="{ 'eq-preset-btn--active': isCustom }"
            @click="selectPreset('Кастомный')"
          >
            Кастомный
          </button>
          <button 
            v-for="p in userPresets" 
            :key="p.name"
            class="eq-preset-btn eq-preset-btn--user"
            :class="{ 'eq-preset-btn--active': selectedPreset === p.name }"
            @click="selectPreset(p.name)"
            @contextmenu.prevent="deletePreset(p.name)"
            title="Нажми правую кнопку мыши, чтобы удалить"
          >
            {{ p.name }}
          </button>
        </div>

        <div class="eq-bands-wrap">
          <div class="eq-db-axis">
            <span>+12</span>
            <span>0</span>
            <span>-12</span>
          </div>
          <div class="eq-bands">
            <div 
              class="eq-band" 
              v-for="(hz, i) in FREQUENCIES" 
              :key="hz"
            >
              <div class="eq-slider-wrapper">
                <div class="eq-slider-track">
                  <div class="eq-slider-fill" :style="{ height: getFillPct(activeGains[i]) + '%' }"></div>
                </div>
                <div class="eq-slider-thumb" :style="{ bottom: getFillPct(activeGains[i]) + '%' }"></div>
                <input 
                  type="range" 
                  min="-12" 
                  max="12" 
                  step="0.5" 
                  class="eq-slider"
                  :value="activeGains[i]"
                  @input="onBandChange(i, $event)"
                />
              </div>
              <div class="eq-hz">{{ formatHz(hz) }}</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="eq-modal__footer">
        <div class="eq-footer-left">
          <button class="eq-action-btn" @click="reset">Сбросить</button>
          
          <template v-if="!isSaving">
            <button class="eq-action-btn" @click="startSave">Сохранить</button>
          </template>
          <template v-else>
            <div class="eq-save-group">
              <input 
                ref="saveInputRef"
                v-model="saveName" 
                class="eq-save-input" 
                placeholder="Имя пресета..." 
                @keyup.enter="commitSave" 
                @keyup.esc="isSaving = false"
              />
              <button class="eq-action-btn eq-action-btn--primary" @click="commitSave">Готово</button>
            </div>
          </template>
        </div>
        <button class="btn" @click="emit('close')">Закрыть</button>
      </div>
    </div>
  </div>
  </Transition>
</template>

<style scoped>
.eq-overlay {
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
.eq-modal {
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 600px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.eq-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
}
.eq-modal__title-group {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-0);
}
.eq-modal__title-group h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.eq-modal__body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  transition: opacity var(--motion-duration-fast) var(--motion-ease-out);
}
.eq-modal__body--disabled {
  opacity: 0.3;
  pointer-events: none;
}

.eq-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.eq-preset-btn {
  background: var(--bg-3);
  border: none;
  color: var(--text-1);
  font-size: 13px;
  font-weight: 600;
  padding: 7px 13px;
  border-radius: 999px;
  cursor: pointer;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
}
.eq-preset-btn:hover {
  background: var(--bg-4);
  color: var(--text-0);
}
.eq-preset-btn--user {
  border: 1px dashed var(--border-strong);
  padding: 6px 12px;
}
.eq-preset-btn.eq-preset-btn--active {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  border: none !important;
  padding: 7px 13px !important;
}

.eq-bands-wrap {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-top: 16px;
}
.eq-db-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 140px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
  text-align: right;
  width: 24px;
}

.eq-bands {
  flex: 1;
  display: flex;
  justify-content: space-between;
}
.eq-band {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

/* Vertical slider styling */
.eq-slider-wrapper {
  width: 24px;
  height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.eq-slider-track {
  position: absolute;
  width: 6px;
  height: 140px;
  background: var(--bg-3);
  border-radius: 4px;
  overflow: hidden;
  pointer-events: none;
}
.eq-slider-fill {
  position: absolute;
  bottom: 0;
  width: 100%;
  background: var(--accent-1);
  transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.eq-slider-thumb {
  position: absolute;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent-1);
  border: 2px solid var(--bg-1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  left: 50%;
  transform: translateX(-50%) translateY(50%);
  transition: bottom 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 2;
}

.eq-slider {
  position: absolute;
  width: 140px;
  height: 24px;
  opacity: 0;
  cursor: pointer;
  transform: rotate(-90deg);
  margin: 0;
  z-index: 10;
}

.eq-hz {
  font-size: 11px;
  color: var(--text-2);
  font-weight: 600;
  text-align: center;
  width: 32px;
}

.eq-modal__footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-2);
}

.eq-footer-left {
  display: flex;
  gap: 8px;
}

.eq-action-btn {
  background: var(--bg-3);
  border: none;
  color: var(--text-1);
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--motion-duration-fast) var(--motion-ease-out);
}
.eq-action-btn:hover {
  background: var(--bg-4);
  color: var(--text-0);
}
.eq-action-btn--primary {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: #fff;
}
.eq-action-btn--primary:hover {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: #fff;
  opacity: 0.9;
}

.eq-save-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.eq-save-input {
  background: var(--bg-1);
  border: 1px solid var(--border-strong);
  color: var(--text-0);
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  outline: none;
  width: 140px;
}
.eq-save-input:focus {
  border-color: var(--accent-1);
}

.eq-switch {
  position: relative;
  width: 44px;
  height: 24px;
  cursor: pointer;
}
.eq-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}
.eq-switch__slider {
  position: absolute;
  inset: 0;
  background: var(--bg-4);
  border-radius: 24px;
  transition: background var(--motion-duration-fast);
}
.eq-switch__slider::before {
  content: "";
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: transform var(--motion-duration-fast);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.eq-switch input:checked + .eq-switch__slider {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
}
.eq-switch input:checked + .eq-switch__slider::before {
  transform: translateX(20px);
}

/* Modal Animations */
.eq-fade-enter-active,
.eq-fade-leave-active {
  transition: opacity 0.25s ease;
}
.eq-fade-enter-active .eq-modal {
  animation: eq-modal-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.eq-fade-leave-active .eq-modal {
  animation: eq-modal-out 0.25s ease-in;
}

.eq-fade-enter-from,
.eq-fade-leave-to {
  opacity: 0;
}

@keyframes eq-modal-in {
  from {
    transform: translateY(20px) scale(0.95);
  }
  to {
    transform: translateY(0) scale(1);
  }
}
@keyframes eq-modal-out {
  from {
    transform: translateY(0) scale(1);
  }
  to {
    transform: translateY(10px) scale(0.95);
  }
}
</style>
