import { defineStore } from "pinia";
import { ref, watch, shallowRef } from "vue";

export interface EqualizerBand {
  hz: number;
  gain: number; // -12 to +12
}

export interface EqualizerPreset {
  name: string;
  bands: number[]; // 10 values corresponding to the 10 frequencies
}

const FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export const PRESETS: EqualizerPreset[] = [
  { name: "Обычный", bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: "Поп", bands: [-2, -1, 0, 2, 3, 3, 1, 0, -1, -2] },
  { name: "Рок", bands: [4, 3, 2, 0, -1, -1, 1, 2, 3, 4] },
  { name: "Классика", bands: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
  { name: "Джаз", bands: [3, 2, 1, 2, -1, -1, 0, 1, 2, 3] },
  { name: "Бас", bands: [6, 5, 4, 1, 0, 0, 0, 0, 0, 0] },
  { name: "Голос", bands: [-2, -1, 0, 1, 4, 4, 2, 0, -1, -2] },
];

export const useEqualizerStore = defineStore("equalizer", () => {
  const enabled = ref(false);
  const selectedPreset = ref<string>("Обычный");
  const customBands = ref<number[]>([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const userPresets = ref<EqualizerPreset[]>([]);

  // Read from localStorage
  try {
    const raw = localStorage.getItem("vkmp:eq");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.enabled === "boolean") enabled.value = parsed.enabled;
      if (typeof parsed.preset === "string") selectedPreset.value = parsed.preset;
      if (Array.isArray(parsed.customBands) && parsed.customBands.length === 10) {
        customBands.value = parsed.customBands;
      }
      if (Array.isArray(parsed.userPresets)) {
        userPresets.value = parsed.userPresets;
      }
    }
  } catch {}

  // Save to localStorage
  watch(
    [enabled, selectedPreset, customBands, userPresets],
    () => {
      localStorage.setItem(
        "vkmp:eq",
        JSON.stringify({
          enabled: enabled.value,
          preset: selectedPreset.value,
          customBands: customBands.value,
          userPresets: userPresets.value,
        })
      );
      applyToNodes();
    },
    { deep: true }
  );

  const audioCtx = shallowRef<AudioContext | null>(null);
  const eqInput = shallowRef<GainNode | null>(null);
  const filterNodes = shallowRef<BiquadFilterNode[]>([]);
  const attachedElements = new WeakSet<HTMLAudioElement>();

  // Get current active gains based on preset or custom
  function getCurrentGains() {
    if (!enabled.value) return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (selectedPreset.value === "Кастомный") return customBands.value;
    const preset = PRESETS.find((p) => p.name === selectedPreset.value) || userPresets.value.find((p) => p.name === selectedPreset.value);
    return preset ? preset.bands : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  function applyToNodes() {
    if (!filterNodes.value.length) return;
    const gains = getCurrentGains();
    filterNodes.value.forEach((node, i) => {
      // Smoothly transition gain
      node.gain.setTargetAtTime(gains[i], audioCtx.value!.currentTime, 0.1);
    });
  }

  function setPreset(name: string) {
    selectedPreset.value = name;
  }

  function setBandGain(index: number, gain: number) {
    if (selectedPreset.value !== "Кастомный") {
      // If we are modifying a predefined preset, clone it to custom first
      const currentPreset = PRESETS.find((p) => p.name === selectedPreset.value) || userPresets.value.find((p) => p.name === selectedPreset.value);
      if (currentPreset) {
        customBands.value = [...currentPreset.bands];
      } else {
        customBands.value = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      }
      selectedPreset.value = "Кастомный";
    }
    customBands.value[index] = gain;
  }

  function resetBands() {
    customBands.value = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    selectedPreset.value = "Кастомный";
  }

  function saveUserPreset(name: string) {
    if (!name.trim()) return;
    const exists = userPresets.value.findIndex(p => p.name === name);
    const newPreset = { name, bands: [...getCurrentGains()] };
    if (exists !== -1) {
      userPresets.value[exists] = newPreset;
    } else {
      userPresets.value.push(newPreset);
    }
    selectedPreset.value = name;
  }

  function deleteUserPreset(name: string) {
    userPresets.value = userPresets.value.filter(p => p.name !== name);
    if (selectedPreset.value === name) {
      selectedPreset.value = "Кастомный";
    }
  }

  function connectAudioElement(audioElement: HTMLAudioElement) {
    if (attachedElements.has(audioElement)) return;

    if (!audioCtx.value) {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtx.value = ctx;
      
      const input = ctx.createGain();
      eqInput.value = input;

      const nodes: BiquadFilterNode[] = [];
      let prevNode: AudioNode = input;

      FREQUENCIES.forEach((freq, i) => {
        const filter = ctx.createBiquadFilter();
        if (i === 0) {
          filter.type = "lowshelf";
        } else if (i === FREQUENCIES.length - 1) {
          filter.type = "highshelf";
        } else {
          filter.type = "peaking";
          filter.Q.value = 1.41; 
        }
        filter.frequency.value = freq;
        filter.gain.value = 0;
        nodes.push(filter);

        prevNode.connect(filter);
        prevNode = filter;
      });

      prevNode.connect(ctx.destination);
      filterNodes.value = nodes;

      applyToNodes();
    }

    // Connect this new audio element to our shared EQ input
    const source = audioCtx.value.createMediaElementSource(audioElement);
    source.connect(eqInput.value!);
    attachedElements.add(audioElement);
  }

  // We expose frequencies for the UI
  return {
    FREQUENCIES,
    PRESETS,
    userPresets,
    enabled,
    selectedPreset,
    customBands,
    setPreset,
    setBandGain,
    resetBands,
    saveUserPreset,
    deleteUserPreset,
    connectAudioElement,
  };
});
