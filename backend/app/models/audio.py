from __future__ import annotations

from pydantic import Field

from .common import APIModel


class TrackArtist(APIModel):
    name: str
    id: str | None = None
    domain: str | None = None


class Track(APIModel):
    id: int
    owner_id: int
    title: str
    subtitle: str | None = None
    artist: str
    duration: int = 0
    url: str = ""
    cover_small: str | None = None
    cover_medium: str | None = None
    cover_large: str | None = None
    album_title: str | None = None
    main_artists: list[TrackArtist] = Field(default_factory=list)
    featured_artists: list[TrackArtist] = Field(default_factory=list)
    is_explicit: bool = False
    lyrics_id: int | None = None
    date: int = 0
    access_key: str | None = None

    @property
    def full_id(self) -> str:
        if self.access_key:
            return f"{self.owner_id}_{self.id}_{self.access_key}"
        return f"{self.owner_id}_{self.id}"


class TrackList(APIModel):
    items: list[Track] = Field(default_factory=list)
    count: int = 0
    next_from: str | None = None
    block_id: str | None = None


class RecommendationBlock(APIModel):
    """One card on the home screen (e.g. 'Для вас', 'Открытия', 'Плейлист дня')."""

    id: str
    title: str
    subtitle: str | None = None
    cover: str | None = None
    accent: str | None = None  # gradient / color hint for the card
    section_id: str | None = None  # used to drill in via audio.getCatalogSection
    playlist_id: str | None = None
    owner_id: int | None = None
    track_count: int | None = None
    # When the block is built from audio.getRecommendations rather than a real
    # VK playlist, we ship the tracks inline so the frontend can play them
    # without a follow-up request.
    tracks: list[Track] = Field(default_factory=list)


class RecommendationFeed(APIModel):
    title: str = "Собрано алгоритмами"
    blocks: list[RecommendationBlock] = Field(default_factory=list)


class AlbumSummary(APIModel):
    """Compact playlist / album card for the artist page."""

    id: str
    owner_id: int | None = None
    title: str
    subtitle: str | None = None
    cover: str | None = None
    year: int | None = None
    track_count: int | None = None
    type: str | None = None
    main_color: str | None = None
    tracks: list["Track"] = Field(default_factory=list)
    owner_name: str | None = None
    owner_photo: str | None = None

class AlbumList(APIModel):
    items: list[AlbumSummary] = Field(default_factory=list)
    count: int = 0


class CoverLookup(APIModel):
    """Result of fetching cover art from a non-VK source (iTunes today)."""

    artist: str
    title: str
    cover: str | None = None
    source: str | None = None


class Artist(APIModel):
    id: str
    name: str
    domain: str | None = None
    photo: str | None = None
    banner: str | None = None
    is_followed: bool = False


class CatalogSearchResult(APIModel):
    artists: list[Artist] = Field(default_factory=list)
    playlists: list[AlbumSummary] = Field(default_factory=list)
    tracks: list[Track] = Field(default_factory=list)


class ActionItem(APIModel):
    id: str
    title: str
    url: str | None = None
    color: str | None = None
    mix_id: str | None = None
    mix_options: dict | None = None


class HomeSection(APIModel):
    id: str
    title: str
    subtitle: str | None = None
    type: str
    layout: str | None = None
    playlists: list[AlbumSummary] = Field(default_factory=list)
    audios: list[Track] = Field(default_factory=list)
    actions: list[ActionItem] = Field(default_factory=list)
    next_from: str | None = None

