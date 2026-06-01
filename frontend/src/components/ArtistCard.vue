<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useMotion } from "@/composables/useSpring";
import type { Artist } from "@/api/types";

const props = defineProps<{
  artist: Artist;
  index?: number;
}>();

const router = useRouter();
const motion = useMotion();

const variants = computed(() =>
  motion.spring(
    { opacity: 0, y: 16, scale: 0.96 },
    { opacity: 1, y: 0, scale: 1 },
    { stiffness: 260, damping: 24, delay: (props.index ?? 0) * 0.04 }
  )
);

function openArtist() {
  if (props.artist.id) {
    router.push({ name: "artist", params: { id: props.artist.id }, query: { name: props.artist.name } });
  }
}
</script>

<template>
  <button v-motion="variants" class="artist-card" @click="openArtist">
    <div class="artist-card__photo">
      <img v-if="artist.photo" :src="artist.photo" :alt="artist.name" loading="lazy" />
      <div v-else class="artist-card__placeholder">
        {{ artist.name.charAt(0).toUpperCase() }}
      </div>
      <div class="artist-card__play">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
    <div class="artist-card__name">{{ artist.name }}</div>
    <div class="artist-card__sub">Артист</div>
  </button>
</template>

<style scoped>
.artist-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  gap: 8px;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  transition: transform var(--motion-duration-fast) var(--motion-ease-out),
              border-color var(--motion-duration-fast) var(--motion-ease-out);
  cursor: pointer;
  width: 140px;
}
.artist-card:hover {
  border-color: var(--primary);
  transform: translateY(-2px);
}
.artist-card__photo {
  position: relative;
  width: 116px;
  height: 116px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bg-3);
  box-shadow: var(--shadow-sm);
  display: flex;
  align-items: center;
  justify-content: center;
}
.artist-card__photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.artist-card__placeholder {
  font-size: 40px;
  font-weight: 700;
  color: var(--text-2);
}
.artist-card__play {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  opacity: 0;
  transition: opacity var(--motion-duration-fast) var(--motion-ease-out);
}
.artist-card:hover .artist-card__play {
  opacity: 1;
}
.artist-card__name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-0);
  text-align: center;
  width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.artist-card__sub {
  font-size: 12px;
  color: var(--text-2);
  margin-top: -6px;
}
</style>
