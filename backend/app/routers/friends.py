from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status

from ..deps import SessionDep, VKDep
from ..models.user import FriendList, User
from ..services.friends import parse_friends, parse_user
from ..vk.exceptions import VKError

router = APIRouter(prefix="/friends", tags=["friends"])


@router.get("", response_model=FriendList)
async def list_friends(
    vk: VKDep,
    session: SessionDep,
    only_with_audio: bool = Query(True),
    order: str = Query("hints"),
    count: int = Query(2000, ge=1, le=5000),
    offset: int = Query(0, ge=0),
) -> FriendList:
    try:
        response = await vk.call(
            "friends.get",
            session.access_token,
            order=order,
            count=count,
            offset=offset,
            fields="photo_200,can_see_audio",
        )
    except VKError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"kind": "vk_error", "code": exc.code, "message": exc.message},
        ) from exc

    parsed = parse_friends(response)
    if only_with_audio:
        parsed = FriendList(
            items=[u for u in parsed.items if u.audio_visible],
            count=parsed.count,
            visible_count=parsed.visible_count,
        )
    return parsed


@router.get("/{user_id}", response_model=User)
async def get_user(user_id: int, vk: VKDep, session: SessionDep) -> User:
    try:
        response = await vk.call(
            "users.get",
            session.access_token,
            user_ids=user_id,
            fields="photo_200",
        )
    except VKError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"kind": "vk_error", "code": exc.code, "message": exc.message},
        ) from exc
    user = parse_user(response)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    return user
