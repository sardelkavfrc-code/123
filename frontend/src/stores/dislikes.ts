import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/api/client";
import type { Track } from "@/api/types";

/**
 * "Не нравится" — like the official VK player. Disliking is a one-way action:
 * a disliked track is gone for good — removed from the play queue and excluded
 * from VK Mix, and there is no way to un-dislike it. The set is remembered
 * across restarts (localStorage).
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

  /** One-way: mark a track as disliked forever. No-op if already disliked. */
  function dislike(track: Pick<Track, "owner_id" | "id">) {
    const key = trackKey(track);
    if (keys.value.has(key)) return;
    keys.value = new Set(keys.value).add(key);
    persist();
    // Tell VK (audio.addDislike) so its algorithm hides this track and similar
    // ones from recommendations / the mix. Best-effort: local filtering already
    // applies even if the request fails (offline, rate limit, etc.).
    void api.dislikeTrack(track.id, track.owner_id).catch(() => {});
  }

  return { keys, isDisliked, dislike };
});
