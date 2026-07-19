import { defineStore } from "pinia";
import { ref } from "vue";
import { api } from "@/api/client";
import type { Track } from "@/api/types";

/**
 * "Не нравится" — like the official VK player. Disliked tracks are hidden from 
 * the play queue and excluded from VK Mix. The set is remembered across restarts 
 * (localStorage). You can also undo a dislike.
 */
const STORAGE_KEY = "vkmp:dislikes";

function trackKey(track: Pick<Track, "owner_id" | "id">): string {
  return `${track.owner_id}_${track.id}`;
}

function load(): Map<string, Track> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      if (typeof parsed[0] === "string") {
        return new Map(); // clear old format
      }
      return new Map(parsed);
    }
  } catch {
    // ignore malformed storage
  }
  return new Map();
}

export const useDislikesStore = defineStore("dislikes", () => {
  const tracks = ref<Map<string, Track>>(load());

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...tracks.value.entries()]));
    } catch {
      // ignore quota errors
    }
  }

  function isDisliked(track: Pick<Track, "owner_id" | "id">): boolean {
    return tracks.value.has(trackKey(track));
  }

  function dislike(track: Track) {
    const key = trackKey(track);
    if (tracks.value.has(key)) return;
    const newMap = new Map(tracks.value);
    newMap.set(key, track);
    tracks.value = newMap;
    persist();
    void api.dislikeTrack(track.id, track.owner_id).catch(() => {});
  }

  function undislike(track: Pick<Track, "owner_id" | "id">) {
    const key = trackKey(track);
    if (!tracks.value.has(key)) return;
    const newMap = new Map(tracks.value);
    newMap.delete(key);
    tracks.value = newMap;
    persist();
    void api.undislikeTrack(track.id, track.owner_id).catch(() => {});
  }

  return { tracks, isDisliked, dislike, undislike };
});
