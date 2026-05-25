import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api, APIError } from "@/api/client";
import type { FriendList, RecommendationFeed, Track, TrackList } from "@/api/types";

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

  const feed = ref<RecommendationFeed | null>(null);
  const feedLoading = ref(false);

  const myMusicIdSet = ref<Set<string>>(new Set());

  const myMusicHasMore = computed(
    () => myMusicTotal.value > 0 && myMusic.value.length < myMusicTotal.value
  );

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

  async function loadFeed(force = false) {
    if (feed.value && !force) return feed.value;
    feedLoading.value = true;
    try {
      feed.value = await api.feed();
      return feed.value;
    } finally {
      feedLoading.value = false;
    }
  }

  async function addToLibrary(track: Track) {
    const added = await api.addTrack(track.id, track.owner_id);
    myMusic.value = [added, ...myMusic.value];
    refreshMyMusicIndex(myMusic.value);
    return added;
  }

  async function removeFromLibrary(track: Track) {
    await api.removeTrack(track.id, track.owner_id);
    myMusic.value = myMusic.value.filter((t) => !(t.id === track.id && t.owner_id === track.owner_id));
    refreshMyMusicIndex(myMusic.value);
  }

  function isInLibrary(track: Track): boolean {
    return myMusicIdSet.value.has(`${track.owner_id}_${track.id}`);
  }

  function reset() {
    myMusic.value = [];
    myMusicIdSet.value = new Set();
    myMusicTotal.value = 0;
    friends.value = null;
    feed.value = null;
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
    feed,
    feedLoading,
    myMusicIdSet,
    loadMyMusic,
    loadMoreMyMusic,
    loadMyMusicPage,
    loadFriends,
    loadFeed,
    addToLibrary,
    removeFromLibrary,
    isInLibrary,
    reset,
  };
});
