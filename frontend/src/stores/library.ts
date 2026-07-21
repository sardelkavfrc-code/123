import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { api, APIError } from "@/api/client";
import type { FriendList, Track, TrackList, HomeSection, AlbumSummary } from "@/api/types";
import { useSettingsStore } from "./settings";
import { useAuthStore } from "./auth";

/** VK rejects audio.get requests with count > 200 — keep page size below that. */
const PAGE_SIZE = 100;

export const useLibraryStore = defineStore("library", () => {
  const myMusic = ref<Track[]>([]);
  const myMusicLoading = ref(false);
  const myMusicLoadingMore = ref(false);
  const myMusicError = ref<string | null>(null);
  const myMusicTotal = ref(0);

  const myPlaylists = ref<AlbumSummary[]>([]);
  const myPlaylistsLoading = ref(false);
  const myPlaylistsError = ref<string | null>(null);
  const activePlaylist = ref<AlbumSummary | null>(null);
  const currentPlaylistTracks = ref<Track[]>([]);

  const friends = ref<FriendList | null>(null);
  const friendsLoading = ref(false);

  const CACHE_KEY = "vkplayer_cache";
  const CACHE_TTL = 24 * 60 * 60 * 1000;

  const homeSections = ref<HomeSection[] | null>(null);
  const homeSectionsLoading = ref(false);

  const myMusicIdSet = ref<Set<string>>(new Set());
  const addedOriginals = ref<Set<string>>(new Set());
  const addedTracksMap = ref<Map<string, Track>>(new Map());

  const myMusicHasMore = computed(
    () => myMusicTotal.value > 0 && myMusic.value.length < myMusicTotal.value
  );

  watch(
    [homeSections],
    () => {
      if (homeSections.value) {
        localStorage.setItem(
          CACHE_KEY,
          JSON.stringify({
            timestamp: Date.now(),
            homeSections: homeSections.value,
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
      if (parsed.homeSections) homeSections.value = parsed.homeSections;
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
  let activeLoadAllPromise: Promise<Track[]> | null = null;

  async function loadAllMyMusic(force = false): Promise<Track[]> {
    if (myMusicAll.value.length > 0 && !force) return myMusicAll.value;
    if (activeLoadAllPromise && !force) return activeLoadAllPromise;

    if (force) {
      myMusicAll.value = [];
    }

    activeLoadAllPromise = (async () => {
      try {
        const list = await api.myMusicAll();
        myMusicAll.value = list.items;
        myMusic.value = list.items;
        myMusicTotal.value = list.count;
        refreshMyMusicIndex(list.items);
        return list.items;
      } catch (err) {
        console.error("Failed to load all my music", err);
        return [];
      } finally {
        activeLoadAllPromise = null;
      }
    })();

    return activeLoadAllPromise;
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

  async function loadExplore(force = false) {
    if (homeSections.value && !force) return homeSections.value;
    homeSectionsLoading.value = true;
    try {
      const settings = useSettingsStore();
      homeSections.value = await api.explore({
        show_stream_mixes: settings.homeShowStreamMixes,
        show_recomms: settings.homeShowRecomms,
        show_genres: settings.homeShowGenres,
        show_audios: settings.homeShowAudios,
        show_moods: settings.homeShowMoods,
        show_playlists: settings.homeShowPlaylists,
        show_mixes: settings.homeShowMixes,
      });
      return homeSections.value;
    } finally {
      homeSectionsLoading.value = false;
    }
  }

  async function addToLibrary(track: Track) {
    const key = `${track.owner_id}_${track.id}`;
    const added = await api.addTrack(track.id, track.owner_id, track.access_key);
    myMusic.value = [added, ...myMusic.value];
    if (myMusicAll.value.length > 0) {
      myMusicAll.value = [added, ...myMusicAll.value];
    }
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
    if (myMusicAll.value.length > 0) {
      myMusicAll.value = myMusicAll.value.filter((t) => !(t.id === targetId && t.owner_id === targetOwnerId));
    }
    addedOriginals.value.delete(key);
    addedTracksMap.value.delete(key);
    refreshMyMusicIndex(myMusic.value);
  }

  function isInLibrary(track: Track): boolean {
    const key = `${track.owner_id}_${track.id}`;
    return myMusicIdSet.value.has(key) || addedOriginals.value.has(key);
  }

  async function loadMyPlaylists(force = false): Promise<AlbumSummary[]> {
    if (myPlaylists.value.length && !force) return myPlaylists.value;
    myPlaylistsLoading.value = true;
    myPlaylistsError.value = null;
    try {
      const auth = useAuthStore();
      if (!auth.status.user_id) return [];
      const list = await api.albums(auth.status.user_id);
      myPlaylists.value = list.items;
      return list.items;
    } catch (err) {
      myPlaylistsError.value = err instanceof APIError ? err.message : (err as Error).message;
      return [];
    } finally {
      myPlaylistsLoading.value = false;
    }
  }

  async function followPlaylist(playlist: AlbumSummary) {
    await api.followPlaylist(Number(playlist.id), playlist.owner_id || 0, playlist.access_key || undefined);
    await loadMyPlaylists(true);
  }

  async function unfollowPlaylist(playlist: AlbumSummary) {
    await api.deletePlaylist(Number(playlist.id), playlist.owner_id || 0);
    myPlaylists.value = myPlaylists.value.filter((p) => p.id !== playlist.id);
  }

  function isPlaylistFollowed(playlist: AlbumSummary): boolean {
    return myPlaylists.value.some((p) => p.id === playlist.id);
  }

  async function createPlaylist(title: string, description?: string): Promise<AlbumSummary> {
    const newPlaylist = await api.createPlaylist(title, description);
    myPlaylists.value = [newPlaylist, ...myPlaylists.value];
    return newPlaylist;
  }

  async function addTrackToPlaylist(playlist: AlbumSummary, track: Track) {
    await api.addTrackToPlaylist(
      Number(playlist.id),
      playlist.owner_id || 0,
      track.id,
      track.owner_id,
      track.access_key
    );
    const localPl = myPlaylists.value.find((p) => p.id === playlist.id);
    if (localPl) {
      if (localPl.track_count != null) {
        localPl.track_count++;
      }
      if (!localPl.cover) {
        localPl.cover = track.cover_medium || track.cover_small || track.cover_large || null;
      }
    }
  }

  async function addTracksToPlaylist(playlist: AlbumSummary, tracks: Track[]) {
    const audioIds = tracks.map((t) => {
      let idStr = `${t.owner_id}_${t.id}`;
      if (t.access_key) idStr += `_${t.access_key}`;
      return idStr;
    });
    await api.addTracksToPlaylist(
      Number(playlist.id),
      playlist.owner_id || 0,
      audioIds
    );
    const localPl = myPlaylists.value.find((p) => p.id === playlist.id);
    if (localPl) {
      if (localPl.track_count != null) {
        localPl.track_count += tracks.length;
      }
      if (!localPl.cover && tracks.length > 0) {
        localPl.cover = tracks[0].cover_medium || tracks[0].cover_small || tracks[0].cover_large || null;
      }
    }
  }

  async function removeTrackFromPlaylist(playlist: AlbumSummary, track: Track) {
    await api.removeTrackFromPlaylist(
      Number(playlist.id),
      playlist.owner_id || 0,
      track.id,
      track.owner_id
    );
    const localPl = myPlaylists.value.find((p) => p.id === playlist.id);
    if (localPl) {
      if (localPl.track_count != null && localPl.track_count > 0) {
        localPl.track_count--;
      }
    }
    currentPlaylistTracks.value = currentPlaylistTracks.value.filter(
      (t) => !(t.id === track.id && t.owner_id === track.owner_id)
    );
  }

  function reset() {
    myMusic.value = [];
    myMusicAll.value = [];
    myMusicIdSet.value = new Set();
    addedOriginals.value = new Set();
    addedTracksMap.value = new Map();
    myMusicTotal.value = 0;
    myPlaylists.value = [];
    myPlaylistsLoading.value = false;
    myPlaylistsError.value = null;
    activePlaylist.value = null;
    currentPlaylistTracks.value = [];
    friends.value = null;
    homeSections.value = null;
  }

  return {
    myMusic,
    myMusicLoading,
    myMusicLoadingMore,
    myMusicError,
    myMusicTotal,
    myMusicHasMore,
    myPlaylists,
    myPlaylistsLoading,
    myPlaylistsError,
    activePlaylist,
    currentPlaylistTracks,
    friends,
    friendsLoading,
    homeSections,
    homeSectionsLoading,
    myMusicAll,
    myMusicIdSet,
    loadFromCache,
    loadMyMusic,
    loadAllMyMusic,
    loadMoreMyMusic,
    loadMyMusicPage,
    loadFriends,
    loadExplore,
    addToLibrary,
    removeFromLibrary,
    isInLibrary,
    loadMyPlaylists,
    followPlaylist,
    unfollowPlaylist,
    isPlaylistFollowed,
    createPlaylist,
    addTrackToPlaylist,
    addTracksToPlaylist,
    removeTrackFromPlaylist,
    reset,
  };
});
