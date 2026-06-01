import axios, { AxiosError, type AxiosInstance } from "axios";
import type {
  AlbumList,
  Artist,
  AuthStatus,
  CoverLookup,
  FriendList,
  FriendList,
  Track,
  TrackList,
  User,
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

export interface APIErrorDetail {
  kind: string;
  message?: string;
  code?: number;
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
    offset?: number;
    count?: number;
    shuffle?: boolean;
  } = {}): Promise<TrackList> {
    const { data } = await http.get<TrackList>("/audio/recommendations", { params });
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
  async artistAlbums(
    artistId: string
  ): Promise<AlbumList> {
    const { data } = await http.get<AlbumList>(`/audio/artist_albums/${encodeURIComponent(artistId)}`);
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
};
