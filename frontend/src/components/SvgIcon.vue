<script setup lang="ts">
import { computed } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { ICONS, type IconName } from "@/utils/icons";

const props = withDefaults(
  defineProps<{
    name: IconName;
    width?: string | number;
    height?: string | number;
    strokeWidth?: string | number;
    fill?: string;
    stroke?: string;
  }>(),
  {
    width: "100%",
    height: "100%",
    strokeWidth: undefined,
    fill: undefined,
    stroke: undefined,
  }
);

const settings = useSettingsStore();

const iconData = computed(() => {
  const set = settings.iconSet || "line";
  const iconSet = ICONS[set] || ICONS.line;
  const def = iconSet[props.name] || ICONS.line.search;
  return def;
});

const svgWidth = computed(() => props.width);
const svgHeight = computed(() => props.height);
const svgFill = computed(() => props.fill ?? iconData.value.fill ?? "none");
const svgStroke = computed(() => props.stroke ?? iconData.value.stroke ?? "none");
const svgStrokeWidth = computed(() => props.strokeWidth ?? iconData.value.strokeWidth);
</script>

<template>
  <svg
    :viewBox="iconData.viewBox || '0 0 24 24'"
    :width="svgWidth"
    :height="svgHeight"
    :fill="svgFill"
    :stroke="svgStroke"
    :stroke-width="svgStrokeWidth"
    :stroke-linecap="iconData.strokeLinecap"
    :stroke-linejoin="iconData.strokeLinejoin"
    v-html="iconData.content"
  ></svg>
</template>
