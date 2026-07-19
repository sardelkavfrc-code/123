import axios, { AxiosError, type AxiosInstance } from "axios";
import type {
  AlbumList,
  Artist,
  AuthStatus,
  CatalogSearchResult,
  CoverLookup,
  FriendList,
  Track,
  TrackList,
  User,
  ArtistAlbumsResponse,
  VKValidateAccountResponse,
  VKCheckOtpResponse,
  VerificationMethodsResponse,
} from "./types";


const defaultBaseURL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8765";

export const http: AxiosInstance = axios.create({
  baseURL: defaultBaseURL,
  timeout: 30_000,
});

/** Switches axios baseURL to whatever port the embedded backend bound to. */
export function setBackendUrl(url: string): void {
  http.defaults.baseURL = url;
}

let globalRemixstlid = localStorage.getItem("vkmp:remixstlid") || "";

export function setGlobalRemixstlid(val: string): void {
  globalRemixstlid = val;
  localStorage.setItem("vkmp:remixstlid", val);
}

export function getGlobalRemixstlid(): string {
  return globalRemixstlid;
}

export interface APIErrorDetail {
  kind: string;
  message?: string;
  code?: number;
  captcha_sid?: string;
  captcha_img?: string;
  redirect_uri?: string;
  remixstlid?: string;
  validation_type?: string;
  validation_sid?: string;
  phone_mask?: string;
  masked_email?: string;
  error?: string;
}

export class APIError extends Error {
  status: number;
  detail: APIErrorDetail;

  constructor(status: number, detail: APIErrorDetail) {
    super(detail.message || `HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

let isRefreshing = false;
let failedQueue: Array<{ resolve: (value?: unknown) => void; reject: (reason?: any) => void }> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

// Global Captcha Queue
let isCaptchaModalActive = false;
let captchaQueue: Array<{
  sid: string;
  img: string;
  resolve: (key: string | null) => void;
}> = [];

async function processCaptchaQueue() {
  if (isCaptchaModalActive || captchaQueue.length === 0) return;
  isCaptchaModalActive = true;
  const { useUIStore } = await import("@/stores/ui");
  const ui = useUIStore();
  
  while (captchaQueue.length > 0) {
    const current = captchaQueue.shift()!;
    const key = await ui.requestCaptcha(current.sid, current.img);
    current.resolve(key);
  }
  isCaptchaModalActive = false;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => {
          return http(originalRequest);
        }).catch((err) => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        if (window.vkmp?.openVKAuth && localStorage.getItem("wasAuthenticated") === "true") {
          const result = await window.vkmp.openVKAuth(true);
          
          if (result.ok) {
            const { useAuthStore } = await import("@/stores/auth");
            const auth = useAuthStore();
            const loginOk = await auth.loginWithToken({
              access_token: result.access_token,
              user_id: result.user_id,
              remember: true,
            });
            if (loginOk) {
              processQueue(null);
              isRefreshing = false;
              return http(originalRequest);
            }
          } else {
            const { useUIStore } = await import("@/stores/ui");
            useUIStore().notify(`Silent auth fail: ${result.error}`, "error");
          }
        }
        
        // If we reach here, auth failed
        processQueue(error);
        isRefreshing = false;
        
        const { useAuthStore } = await import("@/stores/auth");
        const auth = useAuthStore();
        auth.status.authenticated = false;
        localStorage.removeItem("wasAuthenticated");
        const { router } = await import("@/router");
        router.replace({ name: "auth" });
        
      } catch (e) {
        processQueue(error);
        isRefreshing = false;
        
        const { useAuthStore } = await import("@/stores/auth");
        const auth = useAuthStore();
        auth.status.authenticated = false;
        localStorage.removeItem("wasAuthenticated");
        const { router } = await import("@/router");
        router.replace({ name: "auth" });
      }
    }
    if (error.response) {
      const raw = error.response.data as { detail?: unknown } | undefined;
      let detail: APIErrorDetail;
      if (raw && typeof raw === "object" && "detail" in raw && raw.detail !== undefined) {
        const d = raw.detail;
        if (typeof d === "string") {
          detail = { kind: "error", message: d };
        } else if (typeof d === "object" && d !== null) {
          detail = d as APIErrorDetail;
        } else {
          detail = { kind: "error", message: String(d) };
        }
      } else {
        detail = { kind: "error", message: error.message };
      }

      // --- Global Captcha Interceptor ---
      if ((detail.error === "need_captcha" || detail.captcha_sid || detail.code === 14) && !detail.redirect_uri && !detail.validation_type && originalRequest) {
        const sid = detail.captcha_sid;
        const img = detail.captcha_img;
        if (sid && img) {
          return new Promise<string | null>((resolve) => {
            captchaQueue.push({ sid, img, resolve });
            processCaptchaQueue();
          }).then((key) => {
            if (key) {
              // Retry original request with captcha details
              originalRequest.params = originalRequest.params || {};
              originalRequest.params.captcha_sid = sid;
              originalRequest.params.captcha_key = key;

              if (originalRequest.data && typeof originalRequest.data === "string") {
                try {
                  const dataObj = JSON.parse(originalRequest.data);
                  if (typeof dataObj === "object" && dataObj !== null && !Array.isArray(dataObj)) {
                    dataObj.captcha_sid = sid;
                    dataObj.captcha_key = key;
                    originalRequest.data = JSON.stringify(dataObj);
                  }
                } catch (e) {
                  // Not JSON, ignore
                }
              }

              return http(originalRequest);
            } else {
              // User cancelled captcha, reject original error
              return Promise.reject(new APIError(error.response!.status, detail));
            }
          });
        }
      }

      return Promise.reject(new APIError(error.response.status, detail));
    }
    return Promise.reject(new APIError(0, { kind: "network", message: error.message }));
  }
);

export const api = {
  setGlobalRemixstlid(val: string): void {
    setGlobalRemixstlid(val);
  },
  getGlobalRemixstlid(): string {
    return getGlobalRemixstlid();
  },
  async authStatus(): Promise<AuthStatus> {
    const { data } = await http.get<AuthStatus>("/auth/status");
    return data;
  },
  async loginWithToken(payload: {
    access_token: string;
    user_id?: number;
    remember?: boolean;
  }): Promise<AuthStatus> {
    const { data } = await http.post<AuthStatus>("/auth/token", payload);
    return data;
  },
  async logout(): Promise<void> {
    await http.post("/auth/logout");
  },
  async validateAccount(payload: {
    login: string;
    captcha_sid?: string;
    captcha_key?: string;
    success_token?: string;
  }): Promise<VKValidateAccountResponse> {
    const { data } = await http.post<VKValidateAccountResponse>("/auth/validate", payload);
    return data;
  },
  async sendOtpSms(payload: { sid: string; login?: string }): Promise<any> {
    const { data } = await http.post("/auth/send-sms", payload);
    return data;
  },
  async sendCallreset(payload: { sid: string; login?: string }): Promise<any> {
    const { data } = await http.post("/auth/send-callreset", payload);
    return data;
  },
  async sendEmail(payload: { sid: string; login?: string }): Promise<any> {
    const { data } = await http.post("/auth/send-email", payload);
    return data;
  },
  async sendOtpPush(payload: { sid: string; login?: string }): Promise<any> {
    const { data } = await http.post("/auth/send-push", payload);
    return data;
  },
  async sendOtpMax(payload: { sid: string; login?: string }): Promise<any> {
    const { data } = await http.post("/auth/send-max", payload);
    return data;
  },
  async getVerificationMethods(payload: { sid: string; login?: string }): Promise<VerificationMethodsResponse> {
    const { data } = await http.post<VerificationMethodsResponse>("/auth/verification-methods", payload);
    return data;
  },
  async checkOtp(payload: {
    sid: string;
    code: string;
    verification_method: string;
    login?: string;
  }): Promise<VKCheckOtpResponse> {
    const { data } = await http.post<VKCheckOtpResponse>("/auth/check-otp", payload);
    return data;
  },
  async confirmAuth(payload: {
    grant_type: string;
    username: string;
    code?: string;
    password?: string;
    remember?: boolean;
    sid?: string;
    captcha_sid?: string;
    captcha_key?: string;
  }): Promise<AuthStatus> {
    const { data } = await http.post<AuthStatus>("/auth/confirm", payload);
    return data;
  },


  async myMusic(params: { offset?: number; count?: number } = {}): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/my", { params });
    return data;
  },
  async myMusicAll(): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/my/all");
    return data;
  },
  async musicOfOwner(
    ownerId: number,
    params: { offset?: number; count?: number } = {}
  ): Promise<TrackList> {
    const { data } = await http.get<TrackList>(`/audio/by_owner/${ownerId}`, { params });
    return data;
  },
  async search(params: {
    q: string;
    offset?: number;
    count?: number;
    performer_only?: boolean;
    search_own?: boolean;
    captcha_sid?: string;
    captcha_key?: string;
    remixstlid?: string;
  }): Promise<TrackList> {
    if (!params.remixstlid && globalRemixstlid) {
      params.remixstlid = globalRemixstlid;
    }
    const { data } = await http.get<TrackList>("/audio/search", { params });
    return data;
  },
  async searchCatalog(params: { q: string }): Promise<CatalogSearchResult> {
    const { data } = await http.get<CatalogSearchResult>("/audio/search/catalog", { params });
    return data;
  },
  async recentTracks(): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/my/catalog");
    return data;
  },
  async catalogBlockItems(params: {
    block_id: string;
    start_from: string;
    count?: number;
  }): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/catalog/block/items", { params });
    return data;
  },
  async recommendations(params: {
    target_audio?: string;
    user_id?: number;
    offset?: number;
    count?: number;
    shuffle?: boolean;
  } = {}): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/recommendations", { params });
    return data;
  },
  async mix(params: {
    vibes?: string;
    recognitions?: string;
    langs?: string;
  } = {}): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/mix", { params });
    return data;
  },
  async algorithms(): Promise<AlbumList> {
    const { data } = await http.get<AlbumList>("/audio/algorithms");
    return data;
  },
  async moods(): Promise<AlbumList> {
    const { data } = await http.get<AlbumList>("/audio/moods");
    return data;
  },
  async addTrack(audio_id: number, owner_id: number, access_key?: string): Promise<Track> {
    const params: Record<string, any> = { audio_id, owner_id };
    if (access_key) params.access_key = access_key;
    const { data } = await http.post<Track>("/audio/add", null, { params });
    return data;
  },
  async removeTrack(audio_id: number, owner_id: number): Promise<{ ok: boolean }> {
    const { data } = await http.post<{ ok: boolean }>("/audio/delete", null, {
      params: { audio_id, owner_id },
    });
    return data;
  },
  async dislikeTrack(audio_id: number, owner_id: number): Promise<{ ok: boolean }> {
    const { data } = await http.post<{ ok: boolean }>("/audio/dislike", null, {
      params: { audio_id, owner_id },
    });
    return data;
  },
  async undislikeTrack(audio_id: number, owner_id: number): Promise<{ ok: boolean }> {
    const { data } = await http.post<{ ok: boolean }>("/audio/undislike", null, {
      params: { audio_id, owner_id },
    });
    return data;
  },
  async byArtist(
    artistId: string,
    params: { count?: number; offset?: number; q?: string } = {}
  ): Promise<TrackList> {
    const { data } = await http.get<TrackList>(`/audio/by_artist/${encodeURIComponent(artistId)}`, {
      params,
    });
    return data;
  },
  async artist(artistId: string, params: { name?: string } = {}): Promise<Artist> {
    const { data } = await http.get<Artist>(`/audio/artist/${encodeURIComponent(artistId)}`, {
      params,
    });
    return data;
  },
  async albums(
    ownerId: number,
    params: { offset?: number; count?: number } = {}
  ): Promise<AlbumList> {
    const { data } = await http.get<AlbumList>(`/audio/albums/${ownerId}`, { params });
    return data;
  },
  async artistAlbums(artistId: string, params: { name?: string } = {}): Promise<ArtistAlbumsResponse> {
    const { data } = await http.get<ArtistAlbumsResponse>(`/audio/artist_albums/${encodeURIComponent(artistId)}`, { params });
    return data;
  },
  async playlistTracks(
    ownerId: number,
    playlistId: number,
    params: { offset?: number; count?: number } = {}
  ): Promise<TrackList> {
    const { data } = await http.get<TrackList>(`/audio/playlist/${ownerId}_${playlistId}`, {
      params,
    });
    return data;
  },
  async coverLookup(artist: string, title: string): Promise<CoverLookup> {
    const { data } = await http.get<CoverLookup>("/art/lookup", { params: { artist, title } });
    return data;
  },
  async coverSearch(artist: string, title: string): Promise<CoverLookup> {
    const { data } = await http.get<CoverLookup>("/art/search", { params: { artist, title } });
    return data;
  },

  async friends(params: { only_with_audio?: boolean } = {}): Promise<FriendList> {
    const { data } = await http.get<FriendList>("/friends", { params });
    return data;
  },
  async user(userId: number): Promise<User> {
    const { data } = await http.get<User>(`/friends/${userId}`);
    return data;
  },

  async updateRpc(state: {
    is_playing: boolean;
    title?: string;
    artist?: string;
    cover_url?: string;
    custom_text?: string;
    duration?: number;
    position?: number;
    client_id?: string;
  }): Promise<void> {
    await http.post("/rpc/update", state);
  },
  async clearRpc(): Promise<void> {
    await http.post("/rpc/clear");
  },
  async trackEvent(eventType: "start" | "stop" | "pause" | "play", audioId: number, ownerId: number, uuid: number, duration: number = 0): Promise<{ ok: boolean }> {
    const { data } = await http.post<{ ok: boolean }>("/audio/track-event", null, {
      params: { event_type: eventType, audio_id: audioId, owner_id: ownerId, uuid, duration },
    });
    return data;
  },
};

