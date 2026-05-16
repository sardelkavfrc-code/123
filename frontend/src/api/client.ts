import axios, { AxiosError, type AxiosInstance } from "axios";
import type {
  Artist,
  AuthStatus,
  FriendList,
  RecommendationFeed,
  Track,
  TrackList,
  User,
} from "./types";

const baseURL = import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8765";

export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 30_000,
});

export interface APIErrorDetail {
  kind: string;
  message?: string;
  code?: number;
  validation_sid?: string | null;
  captcha_sid?: string | null;
  captcha_img?: string | null;
  phone_mask?: string | null;
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

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
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
      return Promise.reject(new APIError(error.response.status, detail));
    }
    return Promise.reject(new APIError(0, { kind: "network", message: error.message }));
  }
);

export const api = {
  async authStatus(): Promise<AuthStatus> {
    const { data } = await http.get<AuthStatus>("/auth/status");
    return data;
  },
  async login(payload: {
    username: string;
    password: string;
    code?: string;
    captcha_sid?: string;
    captcha_key?: string;
  }): Promise<AuthStatus> {
    const { data } = await http.post<AuthStatus>("/auth/login", payload);
    return data;
  },
  async loginWithToken(payload: { access_token: string; remember: boolean }): Promise<AuthStatus> {
    const { data } = await http.post<AuthStatus>("/auth/token", payload);
    return data;
  },
  async logout(): Promise<void> {
    await http.post("/auth/logout");
  },

  async myMusic(params: { offset?: number; count?: number } = {}): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/my", { params });
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
  }): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/search", { params });
    return data;
  },
  async recommendations(params: {
    target_audio?: string;
    user_id?: number;
    count?: number;
  } = {}): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/recommendations", { params });
    return data;
  },
  async feed(): Promise<RecommendationFeed> {
    const { data } = await http.get<RecommendationFeed>("/audio/feed");
    return data;
  },
  async addTrack(audio_id: number, owner_id: number): Promise<Track> {
    const { data } = await http.post<Track>("/audio/add", null, { params: { audio_id, owner_id } });
    return data;
  },
  async removeTrack(audio_id: number, owner_id: number): Promise<{ ok: boolean }> {
    const { data } = await http.post<{ ok: boolean }>("/audio/delete", null, {
      params: { audio_id, owner_id },
    });
    return data;
  },
  async byArtist(artistId: string, params: { count?: number; offset?: number } = {}): Promise<TrackList> {
    const { data } = await http.get<TrackList>(`/audio/by_artist/${encodeURIComponent(artistId)}`, {
      params,
    });
    return data;
  },
  async artist(artistId: string): Promise<Artist> {
    const { data } = await http.get<Artist>(`/audio/artist/${encodeURIComponent(artistId)}`);
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
};
