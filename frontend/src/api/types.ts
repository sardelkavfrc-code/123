export interface Track {
  id: number;
  owner_id: number;
  title: string;
  artist: string;
  duration: number;
  url: string;
  album_cover: string | null;
  album_title: string | null;
  main_artists: TrackArtist[];
  featured_artists: TrackArtist[];
  is_explicit: boolean;
  lyrics_id: number | null;
  date: number;
}

export interface TrackArtist {
  name: string;
  id: string | null;
  domain: string | null;
}

export interface TrackList {
  items: Track[];
  count: number;
  next_from: string | null;
}

export interface RecommendationBlock {
  id: string;
  title: string;
  subtitle: string | null;
  cover: string | null;
  accent: string | null;
  section_id: string | null;
  playlist_id: string | null;
  owner_id: number | null;
  track_count: number | null;
}

export interface RecommendationFeed {
  title: string;
  blocks: RecommendationBlock[];
}

export interface Artist {
  id: string;
  name: string;
  domain: string | null;
  photo: string | null;
  is_followed: boolean;
}

export interface User {
  id: number;
  first_name: string;
  last_name: string;
  photo: string | null;
  audio_visible: boolean;
}

export interface FriendList {
  items: User[];
  count: number;
  visible_count: number;
}

export interface AuthStatus {
  authenticated: boolean;
  user_id: number | null;
  first_name: string | null;
  last_name: string | null;
  photo: string | null;
}
