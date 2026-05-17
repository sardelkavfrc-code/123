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
    artist: str
    duration: int = 0
    url: str = ""
    album_cover: str | None = None
    album_title: str | None = None
    main_artists: list[TrackArtist] = Field(default_factory=list)
    featured_artists: list[TrackArtist] = Field(default_factory=list)
    is_explicit: bool = False
    lyrics_id: int | None = None
    date: int = 0

    @property
    def full_id(self) -> str:
        return f"{self.owner_id}_{self.id}"


class TrackList(APIModel):
    items: list[Track] = Field(default_factory=list)
    count: int = 0
    next_from: str | None = None


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


class RecommendationFeed(APIModel):
    title: str = "Собрано алгоритмами"
    blocks: list[RecommendationBlock] = Field(default_factory=list)


class Artist(APIModel):
    id: str
    name: str
    domain: str | None = None
    photo: str | None = None
    is_followed: bool = False
