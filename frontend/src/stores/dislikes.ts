import { defineStore } from "pinia";
import { ref } from "vue";
import type { Track } from "@/api/types";

/**
 * "Не нравится" — like the official VK player. Disliked tracks are remembered
 * across restarts (localStorage), skipped/removed from the play queue, and
 * excluded from VK Mix so they don't come back.
 */
const STORAGE_KEY = "vkmp:dislikes";

function trackKey(track: Pick<Track, "owner_id" | "id">): string {
  return `${track.owner_id}_${track.id}`;
}

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return new Set(parsed.map(String));
  } catch {
    // ignore malformed storage
  }
  return new Set();
}

export const useDislikesStore = defineStore("dislikes", () => {
  // Reassigned (not mutated) on every change so computed()s that read it re-run.
  const keys = ref<Set<string>>(load());

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys.value]));
    } catch {
      // ignore quota errors
    }
  }

  function isDisliked(track: Pick<Track, "owner_id" | "id">): boolean {
    return keys.value.has(trackKey(track));
  }

  function dislike(track: Pick<Track, "owner_id" | "id">) {
    const key = trackKey(track);
    if (keys.value.has(key)) return;
    keys.value = new Set(keys.value).add(key);
    persist();
  }

  function undislike(track: Pick<Track, "owner_id" | "id">) {
    const key = trackKey(track);
    if (!keys.value.has(key)) return;
    const next = new Set(keys.value);
    next.delete(key);
    keys.value = next;
    persist();
  }

  /** Toggle and return the resulting disliked state. */
  function toggle(track: Pick<Track, "owner_id" | "id">): boolean {
    if (isDisliked(track)) {
      undislike(track);
      return false;
    }
    dislike(track);
    return true;
  }

  return { keys, isDisliked, dislike, undislike, toggle };
});
