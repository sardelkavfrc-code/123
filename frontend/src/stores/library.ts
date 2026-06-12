import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { api, APIError } from "@/api/client";
import type { AlbumList, FriendList, Track, TrackList } from "@/api/types";

/** VK rejects audio.get requests with count > 200 — keep page size below that. */
const PAGE_SIZE = 100;

export const useLibraryStore = defineStore("library", () => {
  const myMusic = ref<Track[]>([]);
  const myMusicLoading = ref(false);
  const myMusicLoadingMore = ref(false);
  const myMusicError = ref<string | null>(null);
  const myMusicTotal = ref(0);

  const friends = ref<FriendList | null>(null);
  const friendsLoading = ref(false);

  const CACHE_KEY = "vkplayer_cache";
  const CACHE_TTL = 24 * 60 * 60 * 1000;

  const algorithms = ref<AlbumList | null>(null);
  const moods = ref<AlbumList | null>(null);
  const albumsLoading = ref(false);
  const moodsLoading = ref(false);

  const myMusicIdSet = ref<Set<string>>(new Set());
  const addedOriginals = ref<Set<string>>(new Set());
  const addedTracksMap = ref<Map<string, Track>>(new Map());

  const myMusicHasMore = computed(
    () => myMusicTotal.value > 0 && myMusic.value.length < myMusicTotal.value
  );

  watch(
    [algorithms, moods],
    () => {
      if (algorithms.value || moods.value) {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            timestamp: Date.now(),
            algorithms: algorithms.value,
            moods: moods.value,
          })
        );
      }
    },
    { deep: true }
  );

  function loadFromCache() {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (!stored) return false;
      const parsed = JSON.parse(stored);
      if (Date.now() - parsed.timestamp > CACHE_TTL) {
        localStorage.removeItem(CACHE_KEY);
        return false;
      }
      if (parsed.algorithms) algorithms.value = parsed.algorithms;
      if (parsed.moods) moods.value = parsed.moods;
      return true;
    } catch {
      return false;
    }
  }

  function refreshMyMusicIndex(items: Track[]) {
    myMusicIdSet.value = new Set(items.map((t) => `${t.owner_id}_${t.id}`));
  }

  async function loadMyMusic(force = false): Promise<Track[]> {
    if (myMusic.value.length && !force) return myMusic.value;
    myMusicLoading.value = true;
    myMusicError.value = null;
    try {
      const list = await api.myMusic({ count: PAGE_SIZE, offset: 0 });
      myMusic.value = list.items;
      myMusicTotal.value = list.count;
      refreshMyMusicIndex(list.items);
      return list.items;
    } catch (err) {
      myMusicError.value = err instanceof APIError ? err.message : (err as Error).message;
      return [];
    } finally {
      myMusicLoading.value = false;
    }
  }

  async function loadMoreMyMusic(): Promise<void> {
    if (myMusicLoadingMore.value || myMusicLoading.value) return;
    if (!myMusicHasMore.value) return;
    myMusicLoadingMore.value = true;
    try {
      const list = await api.myMusic({
        offset: myMusic.value.length,
        count: PAGE_SIZE,
      });
      // Dedupe in case VK returns overlapping items — happens occasionally on
      // collections that change between pages.
      const have = new Set(myMusic.value.map((t) => `${t.owner_id}_${t.id}`));
      const fresh = list.items.filter((t) => !have.has(`${t.owner_id}_${t.id}`));
      myMusic.value = [...myMusic.value, ...fresh];
      if (list.count > 0) myMusicTotal.value = list.count;
      refreshMyMusicIndex(myMusic.value);
    } finally {
      myMusicLoadingMore.value = false;
    }
  }

  const myMusicAll = ref<Track[]>([]);

  async function loadAllMyMusic(): Promise<Track[]> {
    if (myMusicAll.value.length > 0) return myMusicAll.value;
    try {
      const list = await api.myMusicAll();
      myMusicAll.value = list.items;
      return list.items;
    } catch (err) {
      console.error("Failed to load all my music", err);
      return [];
    }
  }

  async function loadMyMusicPage(offset: number, count: number): Promise<TrackList> {
    const list = await api.myMusic({ offset, count });
    if (offset === 0) {
      myMusic.value = list.items;
      refreshMyMusicIndex(list.items);
    } else {
      myMusic.value = [...myMusic.value, ...list.items];
      refreshMyMusicIndex(myMusic.value);
    }
    if (list.count > 0) myMusicTotal.value = list.count;
    return list;
  }

  async function loadFriends(force = false) {
    if (friends.value && !force) return friends.value;
    friendsLoading.value = true;
    try {
      friends.value = await api.friends({ only_with_audio: true });
      return friends.value;
    } finally {
      friendsLoading.value = false;
    }
  }

  async function loadAlgorithms(force = false) {
    if (algorithms.value && !force) return algorithms.value;
    albumsLoading.value = true;
    try {
      algorithms.value = await api.algorithms();
      return algorithms.value;
    } finally {
      albumsLoading.value = false;
    }
  }

  async function loadMoods(force = false) {
    if (moods.value && !force) return moods.value;
    moodsLoading.value = true;
    try {
      moods.value = await api.moods();
      return moods.value;
    } finally {
      moodsLoading.value = false;
    }
  }

  async function addToLibrary(track: Track) {
    const key = `${track.owner_id}_${track.id}`;
    const added = await api.addTrack(track.id, track.owner_id);
    myMusic.value = [added, ...myMusic.value];
    addedOriginals.value.add(key);
    addedTracksMap.value.set(key, added);
    refreshMyMusicIndex(myMusic.value);
    return added;
  }

  async function removeFromLibrary(track: Track) {
    const key = `${track.owner_id}_${track.id}`;
    
    // If the track was added in this session, use the newly added track's user-owned ID.
    // Otherwise, try to remove it using its given ID (it might already be a user-owned track).
    const added = addedTracksMap.value.get(key);
    const targetId = added ? added.id : track.id;
    const targetOwnerId = added ? added.owner_id : track.owner_id;

    await api.removeTrack(targetId, targetOwnerId);
    myMusic.value = myMusic.value.filter((t) => !(t.id === targetId && t.owner_id === targetOwnerId));
    addedOriginals.value.delete(key);
    addedTracksMap.value.delete(key);
    refreshMyMusicIndex(myMusic.value);
  }

  function isInLibrary(track: Track): boolean {
    const key = `${track.owner_id}_${track.id}`;
    return myMusicIdSet.value.has(key) || addedOriginals.value.has(key);
  }

  function reset() {
    myMusic.value = [];
    myMusicIdSet.value = new Set();
    addedOriginals.value = new Set();
    addedTracksMap.value = new Map();
    myMusicTotal.value = 0;
    friends.value = null;
    algorithms.value = null;
    moods.value = null;
  }

  return {
    myMusic,
    myMusicLoading,
    myMusicLoadingMore,
    myMusicError,
    myMusicTotal,
    myMusicHasMore,
    friends,
    friendsLoading,
    algorithms,
    moods,
    albumsLoading,
    moodsLoading,
    myMusicAll,
    myMusicIdSet,
    loadFromCache,
    loadMyMusic,
    loadAllMyMusic,
    loadMoreMyMusic,
    loadMyMusicPage,
    loadFriends,
    loadAlgorithms,
    loadMoods,
    addToLibrary,
    removeFromLibrary,
    isInLibrary,
    reset,
  };
});
