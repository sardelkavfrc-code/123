<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import type { Track } from "@/api/types";
import { api, APIError } from "@/api/client";
import { usePlayerStore } from "@/stores/player";
import { useUIStore } from "@/stores/ui";
import Spinner from "@/components/Spinner.vue";

const props = defineProps<{ show: boolean; tracks: Track[] }>();
const emit = defineEmits<{ 
  close: []; 
  delete: [track: Track];
  deleteAll: [];
  replace: [oldTrack: Track, newTrack: Track];
}>();

const player = usePlayerStore();
const ui = useUIStore();
const isDeletingAll = ref(false);

// Search and replacement state maps, keyed by `${owner_id}_${id}`
const searchResults = ref<Record<string, Track[]>>({});
const searchLoading = ref<Record<string, boolean>>({});
const replacingTracks = ref<Record<string, boolean>>({});
const isSearchingAll = ref(false);

// External cover art cache, keyed by `${owner_id}_${id}`
const externalCovers = ref<Record<string, string | null>>({});

// Manual search states
const activeTrackForSearch = ref<Track | null>(null);
const manualSearchQuery = ref("");
const manualSearchResults = ref<Track[]>([]);
const manualSearchLoading = ref(false);

const getTrackKey = (t: Track) => `${t.owner_id}_${t.id}`;


let isAborted = false;
let searchSession = 0;

// Reset search loop and loading states when the modal is closed
watch(() => props.show, (newVal) => {
  if (!newVal) {
    isAborted = true;
    searchSession++;
    isSearchingAll.value = false;
    for (const key in searchLoading.value) {
      searchLoading.value[key] = false;
    }
  } else {
    isAborted = false;
    searchSession++;
  }
});

onBeforeUnmount(() => {
  isAborted = true;
  searchSession++;
  isSearchingAll.value = false;
});

// Helper to determine if an API error is a VK rate limit
function isVkRateLimitError(err: any): boolean {
  if (err instanceof APIError) {
    const code = err.detail?.code;
    const kind = err.detail?.kind;
    return kind === "vk_error" && (code === 9 || code === 29);
  }
  return false;
}

// Helper to determine if an API error is a VK captcha error
function isVkCaptchaError(err: any): boolean {
  if (err instanceof APIError) {
    const code = err.detail?.code;
    const kind = err.detail?.kind;
    return kind === "vk_error" && (code === 14 || code === 17);
  }
  return false;
}

// Helper to construct a search query keeping remix words but cleaning punctuation/brackets
function cleanQueryKeepRemix(artist: string, title: string): string {
  if (!artist) return title;
  const mainArtist = artist.split(/[,;/]|feat\.?|ft\.?/i)[0].trim();
  // Remove asterisks and parentheses/brackets but keep their inner text
  const cleanTitle = title.replace(/[*]+/g, "").replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
  return `${mainArtist} ${cleanTitle}`.trim();
}

// Helper to construct a fallback search query stripping parentheses/brackets entirely
function cleanQueryStripRemix(artist: string, title: string): string {
  if (!artist) return title;
  const mainArtist = artist.split(/[,;/]|feat\.?|ft\.?/i)[0].trim();
  const cleanTitle = title.replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  return `${mainArtist} ${cleanTitle || title}`.trim();
}

// Search with retry helper to handle 502/rate-limits/captcha from VK API
async function searchWithRetry(q: string, count: number, retries = 2): Promise<Track[]> {
  const currentSession = searchSession;
  if (isAborted || currentSession !== searchSession) return [];
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (isAborted || currentSession !== searchSession) return [];
    try {
      const res = await api.search({
        q,
        count,
      });
      return res.items || [];
    } catch (err) {
      if (isAborted || currentSession !== searchSession) return [];
      
      // If VK requires captcha (code 14 or 17), we treat it as rate limit and throw immediately
      if (err instanceof APIError && err.detail?.kind === "vk_error" && (err.detail?.code === 14 || err.detail?.code === 17)) {
        throw err;
      }
      
      if (attempt === retries) {
        throw err;
      }
      // Wait longer between attempts (2s, 4s)
      if (isAborted || currentSession !== searchSession) return [];
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  return [];
}

// Load external cover art from iTunes/Genius
async function loadExternalCover(track: Track) {
  const key = getTrackKey(track);
  if (track.cover_small) return; // Has VK cover
  if (externalCovers.value[key] !== undefined) return; // Already cached or fetching
  
  externalCovers.value[key] = null; // Set placeholder
  try {
    let res = await api.coverLookup(track.artist, track.title);
    if (!res.cover) {
      res = await api.coverSearch(track.artist, track.title);
    }
    externalCovers.value[key] = res.cover || null;
  } catch (err) {
    console.error("Failed to load external cover:", err);
  }
}

// Calculate similarity score between original track and search candidate
function calculateSimilarityScore(orig: { artist: string; title: string }, cand: { artist: string; title: string }): number {
  const normalize = (str: string) => {
    return (str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents/diacritics
      .toLowerCase()
      .replace(/[^\w\sа-яА-ЯёЁ]/g, " ") // replace all remaining punctuation with spaces
      .split(/\s+/)
      .filter(word => word.length > 0);
  };

  const origArtistWords = normalize(orig.artist);
  const origTitleWords = normalize(orig.title);
  const candArtistWords = normalize(cand.artist);
  const candTitleWords = normalize(cand.title);

  if (origArtistWords.length === 0 && origTitleWords.length === 0) return 0;

  // Title overlap score
  let titleMatchCount = 0;
  for (const word of candTitleWords) {
    if (origTitleWords.includes(word)) {
      titleMatchCount++;
    }
  }

  // If there are no matching words in the title, it's a completely different song
  if (titleMatchCount === 0 && origTitleWords.length > 0) {
    return 0;
  }

  const titleScoreCand = candTitleWords.length > 0 ? (titleMatchCount / candTitleWords.length) : 0;
  const titleScoreOrig = origTitleWords.length > 0 ? (titleMatchCount / origTitleWords.length) : 0;
  const titleScore = Math.max(titleScoreCand, titleScoreOrig);

  // Artist overlap score
  let artistMatchCount = 0;
  for (const word of candArtistWords) {
    if (origArtistWords.includes(word)) {
      artistMatchCount++;
    }
  }
  const artistScoreCand = candArtistWords.length > 0 ? (artistMatchCount / candArtistWords.length) : 0;
  const artistScoreOrig = origArtistWords.length > 0 ? (artistMatchCount / origArtistWords.length) : 0;
  const artistScore = Math.max(artistScoreCand, artistScoreOrig);

  // Weight title and artist
  const artistWeight = origArtistWords.length > 0 ? 0.5 : 0;
  const titleWeight = origTitleWords.length > 0 ? (1 - artistWeight) : 0;

  return artistScore * artistWeight + titleScore * titleWeight;
}

// Check if a specific alternative track is currently playing
const isPlayingTrack = (track: Track) => {
  return player.current?.id === track.id && 
         player.current?.owner_id === track.owner_id && 
         player.isPlaying;
};

// Play or pause an alternative candidate
function togglePlayTrack(track: Track) {
  if (isPlayingTrack(track)) {
    player.pause();
  } else {
    player.playTrack(track);
  }
}

// Process search results by scoring and filtering
function processAlternatives(origTrack: Track, items: Track[]): Track[] {
  const scoredItems = items.map(item => ({
    item,
    score: calculateSimilarityScore(origTrack, item)
  }));
  
  // Sort descending by score
  scoredItems.sort((a, b) => b.score - a.score);
  
  // Filter out items with very low similarity score (e.g. < 0.25)
  return scoredItems
    .filter(si => si.score >= 0.25)
    .map(si => si.item);
}

// Fetch alternatives with exact query and fallback query
async function fetchAlternativesForTrack(track: Track): Promise<Track[]> {
  // Step 1: Exact match query
  const exactQuery = cleanQueryKeepRemix(track.artist, track.title);
  try {
    const items = await searchWithRetry(exactQuery, 5);
    const processed = processAlternatives(track, items);
    if (processed.length > 0) {
      return processed;
    }
  } catch (err) {
    if (isVkRateLimitError(err) || isVkCaptchaError(err)) {
      throw err; // propagate to stop bulk loops
    }
    console.error("Exact query search failed:", err);
  }

  // Delay to avoid slamming API with consecutive requests
  await new Promise(resolve => setTimeout(resolve, 400));

  // Step 2: Fallback query
  const fallbackQuery = cleanQueryStripRemix(track.artist, track.title);
  if (fallbackQuery === exactQuery) {
    return [];
  }
  try {
    const items = await searchWithRetry(fallbackQuery, 5);
    return processAlternatives(track, items);
  } catch (err) {
    if (isVkRateLimitError(err) || isVkCaptchaError(err)) {
      throw err; // propagate to stop bulk loops
    }
    console.error("Fallback query search failed:", err);
    return [];
  }
}

// Search alternatives for a single track
async function findAlternative(track: Track) {
  const key = getTrackKey(track);
  
  if (searchResults.value[key]) {
    delete searchResults.value[key];
    return;
  }
  
  searchLoading.value[key] = true;
  try {
    const validItems = await fetchAlternativesForTrack(track);
    searchResults.value[key] = validItems;
    // Trigger external cover loading for valid candidates
    validItems.forEach(loadExternalCover);
  } catch (err) {
    console.error("Failed to search alternatives:", err);
    searchResults.value[key] = [];
    
    if (isVkRateLimitError(err) || isVkCaptchaError(err)) {
      ui.notify("Превышен лимит запросов ВКонтакте. Пожалуйста, попробуйте позже.", "error");
    }
  } finally {
    searchLoading.value[key] = false;
  }
}

// Bulk auto-search replacements for all geoblocked tracks in the modal
async function handleAutoSearchAll() {
  if (isSearchingAll.value) return;
  isSearchingAll.value = true;
  const currentSession = searchSession;
  
  const targets = [...props.tracks];
  for (const track of targets) {
    if (isAborted || currentSession !== searchSession) {
      break;
    }
    const key = getTrackKey(track);
    if (searchResults.value[key]) continue; // skip already searched
    
    searchLoading.value[key] = true;
    try {
      const validItems = await fetchAlternativesForTrack(track);
      if (isAborted || currentSession !== searchSession) {
        searchLoading.value[key] = false;
        break;
      }
      searchResults.value[key] = validItems;
      // Load cover for the best candidate
      if (validItems.length > 0) {
        void loadExternalCover(validItems[0]);
      }
    } catch (err) {
      console.error(`Auto-search failed for ${track.title}:`, err);
      searchResults.value[key] = [];
      
      if (isVkRateLimitError(err) || isVkCaptchaError(err)) {
        ui.notify("Поиск приостановлен: превышен лимит запросов ВКонтакте. Пожалуйста, попробуйте позже.", "error");
        searchLoading.value[key] = false;
        break; // Stop loop immediately
      }
    } finally {
      searchLoading.value[key] = false;
    }
    // Rate limit safeguard: wait 3000ms between tracks to avoid triggering 502/rate-limits
    if (isAborted || currentSession !== searchSession) {
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  if (currentSession === searchSession) {
    isSearchingAll.value = false;
  }
}

// Trigger replacement process
async function handleReplace(oldTrack: Track, newTrack: Track) {
  const key = getTrackKey(oldTrack);
  replacingTracks.value[key] = true;
  try {
    emit('replace', oldTrack, newTrack);
  } finally {
    setTimeout(() => {
      replacingTracks.value[key] = false;
    }, 1000);
  }
}

async function handleDeleteAll() {
  if (confirm("Вы уверены, что хотите удалить ВСЕ недоступные треки из библиотеки?")) {
    isDeletingAll.value = true;
    try {
      emit('deleteAll');
    } finally {
      isDeletingAll.value = false;
    }
  }
}

// Manual search handlers
async function startManualSearch(track: Track) {
  activeTrackForSearch.value = track;
  manualSearchQuery.value = cleanQueryKeepRemix(track.artist, track.title);
  manualSearchResults.value = [];
  await performManualSearch();
}

async function performManualSearch() {
  if (!activeTrackForSearch.value) return;
  manualSearchLoading.value = true;
  try {
    const items = await searchWithRetry(manualSearchQuery.value, 30);
    manualSearchResults.value = items;
    // Load covers for manual search results
    items.forEach(loadExternalCover);
  } catch (err) {
    console.error("Manual search failed:", err);
    manualSearchResults.value = [];
    if (isVkRateLimitError(err) || isVkCaptchaError(err)) {
      ui.notify("Превышен лимит запросов ВКонтакте. Пожалуйста, попробуйте позже.", "error");
    }
  } finally {
    manualSearchLoading.value = false;
  }
}

function closeManualSearch() {
  activeTrackForSearch.value = null;
  manualSearchQuery.value = "";
  manualSearchResults.value = [];
}

async function handleManualReplace(newTrack: Track) {
  if (!activeTrackForSearch.value) return;
  const oldTrack = activeTrackForSearch.value;
  await handleReplace(oldTrack, newTrack);
  closeManualSearch();
}

async function handleManualDelete() {
  if (!activeTrackForSearch.value) return;
  const oldTrack = activeTrackForSearch.value;
  emit('delete', oldTrack);
  closeManualSearch();
}

// Watcher for real-time manual search
let debounceTimer: number | null = null;
watch(manualSearchQuery, () => {
  if (debounceTimer) {
    window.clearTimeout(debounceTimer);
  }
  debounceTimer = window.setTimeout(() => {
    void performManualSearch();
  }, 400);
});

onBeforeUnmount(() => {
  if (debounceTimer) {
    window.clearTimeout(debounceTimer);
  }
});
</script>

<template>
  <Transition name="modal-fade">
    <div v-if="show" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-content" :class="{ 'modal-content--search': activeTrackForSearch }" @click.stop>
        <div class="modal-header">
          <div class="modal-title-group">
            <button v-if="activeTrackForSearch" class="btn-back" @click="closeManualSearch" title="Назад к списку">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
            </button>
            <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h2 v-if="activeTrackForSearch">Поиск замены</h2>
            <h2 v-else>Недоступные треки ({{ tracks.length }})</h2>
          </div>
          <button class="modal-close" @click="emit('close')" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- MAIN VIEW: List of blocked tracks -->
        <div v-if="!activeTrackForSearch" class="modal-body">
          <div class="modal-warning">
            <svg class="modal-warning-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              <line x1="12" y1="9" x2="12" y2="13"></line>
              <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
            <div class="modal-warning-text">
              <span>Некоторые треки заблокированы в вашем регионе или изъяты правообладателем. Вы можете автоматически найти им замену в ВК или удалить их из медиатеки.</span>
              <button 
                v-if="tracks.length > 0" 
                class="btn-auto-search" 
                :disabled="isSearchingAll" 
                @click="handleAutoSearchAll"
              >
                <Spinner v-if="isSearchingAll" :size="12" color="currentColor" />
                <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                {{ isSearchingAll ? 'Ищем замену...' : 'Автопоиск замен для всех' }}
              </button>
            </div>
          </div>

          <div class="tracks-list">
            <div v-for="track in tracks" :key="getTrackKey(track)" class="track-item-wrap">
              <div class="track-item">
                <div class="track-info">
                  <div class="track-title">{{ track.title }}</div>
                  <div class="track-artist">{{ track.artist }}</div>
                </div>
                <div class="track-actions">
                  <button 
                    class="btn-action" 
                    :class="{ 'btn-action--active': searchResults[getTrackKey(track)] }"
                    @click="findAlternative(track)" 
                    title="Найти доступную копию"
                  >
                    <Spinner v-if="searchLoading[getTrackKey(track)]" :size="14" />
                    <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="11" cy="11" r="8"></circle>
                      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </button>
                  <button class="btn-action btn-action--danger" @click="emit('delete', track)" title="Удалить трек">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Inline suggested candidate -->
              <div v-if="searchResults[getTrackKey(track)]" class="alternative-panel">
                <div v-if="searchResults[getTrackKey(track)].length === 0" class="alternative-empty">
                  Копии трека не найдены в поиске ВКонтакте.
                  <button class="btn-manual-link" @click="startManualSearch(track)">Попробовать ручной поиск</button>
                </div>
                <div v-else class="alternative-content">
                  <div class="alternative-header-label">Рекомендуемая копия:</div>
                  
                  <div 
                    class="alt-track-row" 
                    :class="{ 'alt-track-row--playing': isPlayingTrack(searchResults[getTrackKey(track)][0]) }"
                  >
                    <button 
                      class="alt-play-btn" 
                      @click="togglePlayTrack(searchResults[getTrackKey(track)][0])"
                      title="Прослушать замену"
                    >
                      <svg v-if="isPlayingTrack(searchResults[getTrackKey(track)][0])" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                      <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </button>
                    
                    <!-- Cover image -->
                    <div class="alt-cover" v-lazy-bg="searchResults[getTrackKey(track)][0].cover_small || searchResults[getTrackKey(track)][0].cover_medium || externalCovers[getTrackKey(searchResults[getTrackKey(track)][0])]">
                      <span v-if="!searchResults[getTrackKey(track)][0].cover_small && !externalCovers[getTrackKey(searchResults[getTrackKey(track)][0])]" class="alt-cover-fallback">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <circle cx="12" cy="12" r="3"></circle>
                          <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5z"></path>
                        </svg>
                      </span>
                    </div>
                    
                    <div class="alt-track-info">
                      <div class="alt-track-title">
                        {{ searchResults[getTrackKey(track)][0].title }}
                      </div>
                      <div class="alt-track-artist">
                        {{ searchResults[getTrackKey(track)][0].artist }}
                      </div>
                    </div>
                    
                    <div class="alt-track-actions">
                      <button 
                        class="btn-alt btn-alt--primary"
                        :disabled="replacingTracks[getTrackKey(track)]"
                        @click="handleReplace(track, searchResults[getTrackKey(track)][0])"
                      >
                        {{ replacingTracks[getTrackKey(track)] ? 'Заменяем...' : 'Заменить' }}
                      </button>
                      <button 
                        class="btn-alt btn-alt--secondary"
                        @click="startManualSearch(track)"
                      >
                        Найти другой
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- SEARCH VIEW: Detailed search and replace -->
        <div v-else class="modal-body search-view-body">
          <div class="original-track-header">
            <div class="original-label">Оригинальный трек:</div>
            <div class="original-details">
              <span class="original-title">{{ activeTrackForSearch.title }}</span>
              <span class="original-separator">&mdash;</span>
              <span class="original-artist">{{ activeTrackForSearch.artist }}</span>
            </div>
          </div>

          <div class="search-input-wrapper">
            <input 
              v-model="manualSearchQuery" 
              type="text" 
              class="search-input"
              placeholder="Введите название трека для поиска..."
              @keyup.enter="performManualSearch"
            />
            <button class="btn-search-trigger" @click="performManualSearch" :disabled="manualSearchLoading">
              <Spinner v-if="manualSearchLoading" :size="16" />
              <svg v-else viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </button>
          </div>

          <div class="manual-results-container">
            <div v-if="manualSearchLoading" class="results-loading">
              <Spinner :size="24" />
              <span>Ищем подходящие варианты...</span>
            </div>
            
            <div v-else-if="manualSearchResults.length === 0" class="results-empty">
              Нет результатов. Попробуйте изменить поисковый запрос.
            </div>

            <div v-else class="manual-results-list">
              <div 
                v-for="alt in manualSearchResults" 
                :key="getTrackKey(alt)"
                class="alt-list-item-full"
                :class="{ 'alt-list-item-full--playing': isPlayingTrack(alt) }"
              >
                <button class="alt-play-btn" @click="togglePlayTrack(alt)">
                  <svg v-if="isPlayingTrack(alt)" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
                
                <!-- Cover image -->
                <div class="alt-cover" v-lazy-bg="alt.cover_small || externalCovers[getTrackKey(alt)]">
                  <span v-if="!alt.cover_small && !externalCovers[getTrackKey(alt)]" class="alt-cover-fallback">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="3"></circle>
                      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5z"></path>
                    </svg>
                  </span>
                </div>
                
                <div class="alt-list-info">
                  <span class="alt-list-title" :title="alt.title">{{ alt.title }}</span>
                  <span class="alt-list-artist" :title="alt.artist">{{ alt.artist }}</span>
                </div>
                <button 
                  class="btn-alt btn-alt--primary"
                  :disabled="replacingTracks[getTrackKey(activeTrackForSearch)]"
                  @click="handleManualReplace(alt)"
                >
                  {{ replacingTracks[getTrackKey(activeTrackForSearch)] ? 'Заменяем...' : 'Заменить' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <template v-if="activeTrackForSearch">
            <button class="btn btn--danger" @click="handleManualDelete">
              Удалить оригинал
            </button>
            <button class="btn btn--ghost" @click="closeManualSearch">
              Назад
            </button>
          </template>
          <template v-else>
            <button 
              class="btn btn--danger" 
              :disabled="tracks.length === 0 || isDeletingAll" 
              @click="handleDeleteAll"
            >
              {{ isDeletingAll ? 'Удаление...' : 'Удалить все' }}
            </button>
            <button class="btn btn--primary" @click="emit('close')">Готово</button>
          </template>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.modal-content {
  position: relative;
  background: var(--bg-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  width: 100%;
  max-width: 600px;
  max-height: 80vh;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: max-width 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.modal-content--search {
  max-width: 700px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-2);
}
.modal-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-0);
}
.modal-title-group h2 {
  margin: 0;
  font-size: calc(18px * var(--font-scale, 1));
  font-weight: 700;
}
.modal-close {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal-close:hover {
  color: var(--text-0);
  background: var(--bg-3);
}

.btn-back {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s, background 0.2s;
  margin-right: 4px;
}
.btn-back:hover {
  color: var(--text-0);
  background: var(--bg-3);
}

.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
}

.search-view-body {
  gap: 16px;
}

.modal-warning {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: 0;
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-1);
  line-height: 1.5;
  background: rgba(255, 171, 0, 0.08);
  padding: 14px 18px;
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 171, 0, 0.2);
}

.modal-warning-icon {
  flex-shrink: 0;
  color: #ffab00;
  margin-top: 2px;
}

.modal-warning-text {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
}

.btn-auto-search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  background: color-mix(in srgb, var(--accent-1) 16%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-1) 30%, transparent);
  color: var(--accent-1);
  font-size: calc(12px * var(--font-scale, 1));
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}
.btn-auto-search:hover:not(:disabled) {
  background: var(--accent-1);
  color: #fff;
  border-color: var(--accent-1);
}
.btn-auto-search:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.tracks-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.track-item-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  background: var(--bg-2);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  transition: border-color 0.2s, background 0.2s;
}
.track-item:hover {
  border-color: var(--border-strong);
  background: var(--bg-3);
}

.track-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}
.track-title {
  color: var(--text-0);
  font-weight: 600;
  font-size: calc(14px * var(--font-scale, 1));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.track-artist {
  color: var(--text-2);
  font-size: calc(12px * var(--font-scale, 1));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 12px;
}

.btn-action {
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  padding: 8px;
  border-radius: var(--radius-sm);
  transition: color 0.2s, background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.btn-action:hover {
  color: var(--text-0);
  background: var(--bg-4);
}
.btn-action--active {
  color: var(--accent-1);
  background: color-mix(in srgb, var(--accent-1) 10%, transparent);
}
.btn-action--active:hover {
  color: var(--accent-1);
  background: color-mix(in srgb, var(--accent-1) 15%, transparent);
}
.btn-action--danger:hover {
  color: #ff4757;
  background: rgba(255, 71, 87, 0.1);
}

/* Alternative panel style */
.alternative-panel {
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 12px 14px;
  margin-bottom: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: slide-down 0.2s ease-out;
}

@keyframes slide-down {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.alternative-header-label {
  font-size: calc(11px * var(--font-scale, 1));
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: calc(0.05em + var(--letter-spacing, 0px));
  color: var(--text-3);
}

.alternative-empty {
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
}

.btn-manual-link {
  background: transparent;
  border: none;
  color: var(--accent-1);
  font-size: calc(12px * var(--font-scale, 1));
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}
.btn-manual-link:hover {
  opacity: 0.8;
}

.alt-track-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}
.alt-track-row--playing {
  border-color: var(--accent-1);
  background: color-mix(in srgb, var(--accent-1) 8%, var(--bg-2));
}

.alt-play-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--bg-4);
  color: var(--text-0);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  transition: transform 0.2s, background 0.2s;
  flex-shrink: 0;
}
.alt-play-btn:hover {
  transform: scale(1.05);
  background: var(--accent-1);
  color: #fff;
}

.alt-cover {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  background-color: var(--bg-4);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.alt-cover-fallback {
  color: var(--text-3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.alt-track-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.alt-track-title {
  color: var(--text-0);
  font-weight: 600;
  font-size: calc(13px * var(--font-scale, 1));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.alt-track-artist {
  color: var(--text-2);
  font-size: calc(11px * var(--font-scale, 1));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.alt-track-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-alt {
  font-size: calc(12px * var(--font-scale, 1));
  font-weight: 600;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: none;
  transition: opacity 0.2s, background 0.2s;
}
.btn-alt--primary {
  background: var(--accent-1);
  color: #fff;
}
.btn-alt--primary:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-alt--primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-alt--secondary {
  background: var(--bg-4);
  color: var(--text-1);
}
.btn-alt--secondary:hover {
  background: var(--bg-5);
  color: var(--text-0);
}

/* Original track preview */
.original-track-header {
  background: color-mix(in srgb, var(--accent-1) 6%, var(--bg-2));
  border: 1px dashed color-mix(in srgb, var(--accent-1) 25%, var(--border));
  border-radius: var(--radius-md);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.original-label {
  font-size: calc(10px * var(--font-scale, 1));
  font-weight: 700;
  text-transform: uppercase;
  color: var(--accent-1);
  letter-spacing: calc(0.05em + var(--letter-spacing, 0px));
}
.original-details {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: calc(14px * var(--font-scale, 1));
  font-weight: 600;
  color: var(--text-0);
  flex-wrap: wrap;
}
.original-title {
  color: var(--text-0);
}
.original-separator {
  color: var(--text-3);
}
.original-artist {
  color: var(--text-2);
  font-weight: 500;
}

/* Search Box styling */
.search-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}
.search-input {
  width: 100%;
  padding: 12px 48px 12px 16px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-0);
  font-size: calc(14px * var(--font-scale, 1));
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.search-input:focus {
  border-color: var(--accent-1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-1) 20%, transparent);
}
.btn-search-trigger {
  position: absolute;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: var(--radius-sm);
  transition: color 0.2s;
}
.btn-search-trigger:hover {
  color: var(--text-0);
}

/* Results panel styling */
.manual-results-container {
  flex: 1;
  min-height: 250px;
  max-height: 40vh;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-2);
  padding: 8px;
}
.results-loading, .results-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 250px;
  color: var(--text-2);
  font-size: calc(14px * var(--font-scale, 1));
  text-align: center;
  padding: 0 24px;
}
.manual-results-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.alt-list-item-full {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: transparent;
  border: 1px solid transparent;
  transition: background 0.2s, border-color 0.2s;
}
.alt-list-item-full:hover {
  background: var(--bg-3);
  border-color: var(--border);
}
.alt-list-item-full--playing {
  background: color-mix(in srgb, var(--accent-1) 8%, var(--bg-2));
  border-color: var(--accent-1);
}
.alt-list-item-full .alt-list-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.alt-list-item-full .alt-list-title {
  color: var(--text-0);
  font-weight: 600;
  font-size: calc(13px * var(--font-scale, 1));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.alt-list-item-full .alt-list-artist {
  color: var(--text-2);
  font-size: calc(11px * var(--font-scale, 1));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Footer styles */
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-2);
}

.btn {
  background: var(--bg-3);
  border: none;
  color: var(--text-1);
  font-size: calc(14px * var(--font-scale, 1));
  font-weight: 600;
  padding: 10px 20px;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background 0.2s, color 0.2s, opacity 0.2s;
}
.btn:hover:not(:disabled) {
  background: var(--bg-4);
  color: var(--text-0);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn--danger {
  color: #ff4757;
  background: rgba(255, 71, 87, 0.1);
}
.btn--danger:hover:not(:disabled) {
  background: #ff4757;
  color: #fff;
}

.btn--primary {
  background: linear-gradient(135deg, var(--accent-1), var(--accent-3));
  color: #fff;
}
.btn--primary:hover:not(:disabled) {
  opacity: 0.9;
  color: #fff;
}

.btn--ghost {
  background: transparent;
  color: var(--text-1);
  border: 1px solid var(--border);
}
.btn--ghost:hover {
  background: var(--bg-3);
  color: var(--text-0);
}

/* Modal Animations */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.25s ease;
}
.modal-fade-enter-active .modal-content {
  animation: modal-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.modal-fade-leave-active .modal-content {
  animation: modal-out 0.25s ease-in;
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

@keyframes modal-in {
  from {
    transform: translateY(20px) scale(0.95);
  }
  to {
    transform: translateY(0) scale(1);
  }
}
@keyframes modal-out {
  from {
    transform: translateY(0) scale(1);
  }
  to {
    transform: translateY(10px) scale(0.95);
  }
}

/* Captcha Overlay */
.captcha-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.captcha-box {
  background: var(--bg-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 24px;
  width: 100%;
  max-width: 320px;
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: center;
}
.captcha-header h3 {
  margin: 0 0 6px 0;
  font-size: calc(16px * var(--font-scale, 1));
  font-weight: 700;
  color: var(--text-0);
}
.captcha-header p {
  margin: 0;
  font-size: calc(12px * var(--font-scale, 1));
  color: var(--text-2);
  line-height: 1.4;
}
.captcha-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.captcha-image {
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  height: 50px;
  object-fit: contain;
  background: #fff;
  padding: 2px;
}
.captcha-input {
  width: 100%;
  padding: 10px 12px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-0);
  font-size: calc(14px * var(--font-scale, 1));
  text-align: center;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.captcha-input:focus {
  border-color: var(--accent-1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-1) 20%, transparent);
}
.captcha-footer {
  display: flex;
  justify-content: center;
  gap: 10px;
}
.captcha-footer .btn {
  flex: 1;
  padding: 8px 16px;
  font-size: calc(13px * var(--font-scale, 1));
}

.captcha-box--redirect {
  max-width: 380px;
}
.captcha-redirect-info {
  font-size: calc(13px * var(--font-scale, 1));
  color: var(--text-1);
  line-height: 1.5;
}
.btn-open-verify {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 12px;
  font-size: calc(14px * var(--font-scale, 1));
  font-weight: 600;
  gap: 8px;
}

/* Captcha Animations */
.captcha-fade-enter-active,
.captcha-fade-leave-active {
  transition: opacity 0.25s ease;
}
.captcha-fade-enter-active .captcha-box {
  animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.captcha-fade-leave-active .captcha-box {
  animation: modal-out 0.2s ease-in;
}
.captcha-fade-enter-from,
.captcha-fade-leave-to {
  opacity: 0;
}
</style>
