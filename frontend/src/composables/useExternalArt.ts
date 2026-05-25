import { computed, ref, watch } from "vue";
import type { Ref } from "vue";
import { api } from "@/api/client";
import { useSettingsStore } from "@/stores/settings";

/** Per-page session cache to avoid hitting the backend twice for the same key. */
const sessionCache = new Map<string, string | null>();

/** Bounded localStorage cache of resolved iTunes covers. */
const STORAGE_KEY = "vkmp:itunes-art";
const STORAGE_LIMIT = 4000;

interface PersistedEntry {
  url: string | null;
  /** Unix millis when we wrote this entry. Used purely for LRU pruning. */
  t: number;
}

function loadPersisted(): Map<string, PersistedEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed = JSON.parse(raw) as Record<string, PersistedEntry>;
    return new Map(Object.entries(parsed));
  } catch {
    return new Map();
  }
}

let persisted: Map<string, PersistedEntry> | null = null;
let persistTimer: number | null = null;

function persistEntries(): void {
  if (!persisted) return;
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    if (!persisted) return;
    try {
      // Prune the oldest entries if we're over the limit.
      if (persisted.size > STORAGE_LIMIT) {
        const entries = [...persisted.entries()].sort((a, b) => a[1].t - b[1].t);
        for (const [key] of entries.slice(0, entries.length - STORAGE_LIMIT)) {
          persisted.delete(key);
        }
      }
      const obj = Object.fromEntries(persisted);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore quota errors
    }
  }, 600);
}

function key(artist: string, title: string): string {
  return `${artist.trim().toLowerCase()}::${title.trim().toLowerCase()}`;
}

function readCache(artist: string, title: string): string | null | undefined {
  const k = key(artist, title);
  if (sessionCache.has(k)) return sessionCache.get(k);
  if (!persisted) persisted = loadPersisted();
  const hit = persisted.get(k);
  if (hit) {
    sessionCache.set(k, hit.url);
    return hit.url;
  }
  return undefined;
}

function writeCache(artist: string, title: string, url: string | null): void {
  const k = key(artist, title);
  sessionCache.set(k, url);
  if (!persisted) persisted = loadPersisted();
  persisted.set(k, { url, t: Date.now() });
  persistEntries();
}

/**
 * Look up cover art for a track from the backend's iTunes proxy and cache
 * it in localStorage. When `enabled` is false the composable is a no-op so
 * users who disable the setting don't pay any network/storage cost.
 *
 * The lookup is intentionally fire-and-forget — the consumer renders the
 * gradient placeholder until `cover` resolves, then transitions to the real
 * cover. No spinner, no layout shift.
 */
export function useExternalArt(
  artistRef: Ref<string | null | undefined>,
  titleRef: Ref<string | null | undefined>,
  hasVkCoverRef: Ref<boolean>
) {
  const settings = useSettingsStore();
  const fetched = ref<string | null>(null);

  const enabled = computed(
    () => settings.externalCovers && !hasVkCoverRef.value && !!artistRef.value && !!titleRef.value
  );

  async function resolve() {
    if (!enabled.value) {
      fetched.value = null;
      return;
    }
    const artist = (artistRef.value || "").trim();
    const title = (titleRef.value || "").trim();
    if (!artist || !title) return;
    const cached = readCache(artist, title);
    if (cached !== undefined) {
      fetched.value = cached;
      return;
    }
    try {
      const res = await api.coverLookup(artist, title);
      writeCache(artist, title, res.cover);
      fetched.value = res.cover;
    } catch {
      writeCache(artist, title, null);
      fetched.value = null;
    }
  }

  watch(
    [artistRef, titleRef, hasVkCoverRef, () => settings.externalCovers],
    () => {
      void resolve();
    },
    { immediate: true }
  );

  return { cover: fetched };
}
