from __future__ import annotations

from app.services.audio import parse_recommendation_feed, parse_track, parse_track_list
from app.services.friends import parse_friends, parse_user


def test_parse_track_minimal() -> None:
    track = parse_track(
        {
            "id": 1,
            "owner_id": 2,
            "title": " Hello ",
            "artist": " World ",
            "duration": 180,
            "url": "https://cdn/audio.mp3",
            "album": {
                "title": "Album",
                "thumb": {"photo_300": "https://cdn/cover.jpg"},
            },
            "main_artists": [{"name": "World", "id": "abc", "domain": "world"}],
            "is_explicit": True,
        }
    )
    assert track.id == 1
    assert track.owner_id == 2
    assert track.title == "Hello"
    assert track.artist == "World"
    assert track.duration == 180
    assert track.url == "https://cdn/audio.mp3"
    assert track.album_cover == "https://cdn/cover.jpg"
    assert track.album_title == "Album"
    assert len(track.main_artists) == 1
    assert track.main_artists[0].name == "World"
    assert track.is_explicit is True
    assert track.full_id == "2_1"


def test_parse_track_list_dict() -> None:
    parsed = parse_track_list(
        {
            "count": 2,
            "items": [
                {"id": 1, "owner_id": 1, "title": "A", "artist": "a"},
                {"id": 2, "owner_id": 1, "title": "B", "artist": "b"},
            ],
            "next_from": "abc",
        }
    )
    assert parsed.count == 2
    assert parsed.next_from == "abc"
    assert [t.title for t in parsed.items] == ["A", "B"]


def test_parse_track_list_handles_list() -> None:
    parsed = parse_track_list(
        [
            {"id": 1, "owner_id": 1, "title": "A", "artist": "a"},
            {"id": 2, "owner_id": 1, "title": "B", "artist": "b"},
        ]
    )
    assert parsed.count == 2


def test_parse_friends_filters_audio_visibility() -> None:
    parsed = parse_friends(
        {
            "count": 2,
            "items": [
                {
                    "id": 1,
                    "first_name": "Alice",
                    "last_name": "A",
                    "photo_200": "https://cdn/a.jpg",
                    "can_see_audio": 1,
                },
                {
                    "id": 2,
                    "first_name": "Bob",
                    "last_name": "B",
                    "photo_200": "https://cdn/b.jpg",
                    "can_see_audio": 0,
                },
            ],
        }
    )
    assert parsed.count == 2
    assert parsed.visible_count == 1
    assert parsed.items[0].audio_visible is True
    assert parsed.items[1].audio_visible is False


def test_parse_user_first_item() -> None:
    user = parse_user(
        [
            {
                "id": 1,
                "first_name": "Eve",
                "last_name": "E",
                "photo_200": "https://cdn/e.jpg",
            }
        ]
    )
    assert user is not None
    assert user.first_name == "Eve"
    assert user.photo == "https://cdn/e.jpg"


def test_parse_recommendation_feed_extracts_playlists() -> None:
    feed = parse_recommendation_feed(
        {
            "catalog": {
                "sections": [
                    {
                        "blocks": [
                            {
                                "data_type": "music_playlists",
                                "playlists_ids": ["-2000000000_1", "-2000000000_2"],
                            }
                        ]
                    }
                ]
            },
            "playlists": [
                {
                    "id": 1,
                    "owner_id": -2000000000,
                    "title": "Для вас",
                    "subtitle": "обновлён сегодня",
                    "photo": {"photo_600": "https://cdn/1.jpg"},
                    "count": 50,
                },
                {
                    "id": 2,
                    "owner_id": -2000000000,
                    "title": "Открытия",
                    "subtitle": "Новое для вас",
                    "count": 30,
                },
            ],
        }
    )
    assert len(feed.blocks) == 2
    titles = [b.title for b in feed.blocks]
    assert "Для вас" in titles
    assert "Открытия" in titles
    assert feed.blocks[0].accent is not None
    assert feed.blocks[0].cover == "https://cdn/1.jpg"
    # No cover available for playlist 2 — must be None, not crash.
    second = next(b for b in feed.blocks if b.title == "Открытия")
    assert second.cover is None


def test_parse_recommendation_feed_handles_inline_playlists_in_block() -> None:
    """Some VK catalog payloads inline the playlist object inside the section
    block instead of referencing it by id from a top-level `playlists` array."""
    feed = parse_recommendation_feed(
        {
            "catalog": {
                "sections": [
                    {
                        "blocks": [
                            {
                                "data_type": "music_playlists",
                                "playlists": [
                                    {
                                        "id": 99,
                                        "owner_id": -2000000007,
                                        "title": "Микс дня",
                                        "thumbs": [{"photo_300": "https://cdn/99.jpg"}],
                                    }
                                ],
                            }
                        ]
                    }
                ]
            }
        }
    )
    assert len(feed.blocks) == 1
    block = feed.blocks[0]
    assert block.title == "Микс дня"
    assert block.cover == "https://cdn/99.jpg"
    assert block.owner_id == -2000000007


def test_parse_recommendation_feed_falls_back_to_flat_playlists() -> None:
    """If the catalog has no sections we still want cards rendered, not an
    empty home screen."""
    feed = parse_recommendation_feed(
        {
            "playlists": [
                {"id": 7, "owner_id": -1, "title": "Старое"},
                {"id": 8, "owner_id": -1, "title": "Новое"},
            ]
        }
    )
    assert {b.title for b in feed.blocks} == {"Старое", "Новое"}


def test_parse_recommendation_feed_tolerates_garbage_and_nulls() -> None:
    """Junk input must not raise. A non-dict response → empty feed; mixed
    valid+invalid → only valid cards surface."""
    assert parse_recommendation_feed(None).blocks == []
    assert parse_recommendation_feed([]).blocks == []
    feed = parse_recommendation_feed(
        {
            "playlists": [
                None,  # ignored
                {"title": "no id"},  # ignored — no id
                {"id": 42, "owner_id": "not a number", "title": "Артист"},  # owner coerces to None
                "string",  # ignored — wrong type
            ]
        }
    )
    assert len(feed.blocks) == 1
    assert feed.blocks[0].title == "Артист"
    assert feed.blocks[0].owner_id is None
    assert feed.blocks[0].playlist_id == "42"


def test_parse_recommendation_feed_dedups_when_referenced_twice() -> None:
    feed = parse_recommendation_feed(
        {
            "catalog": {
                "sections": [
                    {
                        "blocks": [
                            {"data_type": "music_playlists", "playlists_ids": ["-1_1", "-1_1"]}
                        ]
                    }
                ]
            },
            "playlists": [{"id": 1, "owner_id": -1, "title": "Один"}],
        }
    )
    assert len(feed.blocks) == 1
