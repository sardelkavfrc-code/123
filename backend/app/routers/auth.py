from __future__ import annotations

import base64
import logging

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from .. import storage
from ..deps import VKDep
from ..models.auth import AuthStatus, TokenLoginRequest
from ..services.friends import parse_user
from ..vk.audio_token import refresh_to_audio_token
from ..vk.exceptions import VKError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


class ValidateRequest(BaseModel):
    login: str
    captcha_sid: str | None = None
    captcha_key: str | None = None
    success_token: str | None = None


class SendSmsRequest(BaseModel):
    sid: str
    login: str | None = None


class CheckOtpRequest(BaseModel):
    sid: str
    code: str
    verification_method: str
    login: str | None = None


class ConfirmRequest(BaseModel):
    grant_type: str  # "password", "phone_code", or "auth_code"
    username: str
    code: str | None = None
    password: str | None = None
    remember: bool = True
    sid: str | None = None
    captcha_sid: str | None = None
    captcha_key: str | None = None


async def _download_captcha_base64(url: str) -> str | None:
    if not url:
        return None
    try:
        desktop_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        async with httpx.AsyncClient(follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": desktop_ua})
            if resp.status_code == 200 and resp.headers.get("content-type", "").startswith("image/"):
                encoded = base64.b64encode(resp.content).decode("utf-8")
                return f"data:{resp.headers['content-type']};base64,{encoded}"
    except Exception as e:
        logger.warning("Failed to download captcha image: %s", e)
    return url


async def _probe_audio(vk: VKDep, token: str) -> bool:
    """Return True if the token can call audio.* methods.

    Probes with a cheap audio.get count=1 once at login/verification time.
    """
    try:
        await vk.call("audio.get", token, count=1)
    except VKError as exc:
        if exc.code == 3:
            return False
        if exc.code in (5, 1117, 28, 3610):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail={"kind": "vk_error", "message": exc.message},
            ) from exc
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"kind": "vk_error", "message": exc.message},
        ) from exc
    return True


async def _resolve_user(vk: VKDep, token: str, *, has_audio: bool) -> AuthStatus:
    try:
        response = await vk.call("users.get", token, fields="photo_200")
        user = parse_user(response)
    except VKError as exc:
        if exc.code in (5, 1117, 28, 3610):
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail={"kind": "vk_error", "message": exc.message},
            ) from exc
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            detail={"kind": "vk_error", "message": exc.message},
        ) from exc

    if user is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"kind": "vk_error", "message": "Не удалось получить профиль"},
        )

    return AuthStatus(
        authenticated=True,
        user_id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        photo=user.photo,
        has_audio=has_audio,
    )


import asyncio


@router.get("/status", response_model=AuthStatus)
async def status_endpoint(vk: VKDep) -> AuthStatus:
    session = storage.load()
    if session is None:
        return AuthStatus(authenticated=False)
    
    for attempt in range(3):
        try:
            has_audio = await _probe_audio(vk, session.access_token)
            
            # Reload session because _probe_audio might have refreshed it
            current_session = storage.load()
            if not current_session:
                return AuthStatus(authenticated=False)
                
            if not current_session.refresh_token:
                try:
                    exchange_res = await vk.call(
                        "auth.getExchangeToken",
                        current_session.access_token,
                        create_common_token=1,
                        create_tier_tokens=0,
                        api_id=2274003,
                    )
                    if exchange_res:
                        new_token = exchange_res.get("common_token")
                        if not new_token and "users_exchange_tokens" in exchange_res:
                            tokens = exchange_res["users_exchange_tokens"]
                            if tokens and isinstance(tokens, list):
                                new_token = tokens[0].get("common_token")
                        if new_token:
                            current_session.refresh_token = new_token
                            storage.save(current_session)
                            logger.info("Successfully populated missing refresh token on status check")
                except Exception as exc:
                    logger.warning("Failed to populate missing refresh token: %s", exc)
            return await _resolve_user(vk, current_session.access_token, has_audio=has_audio)
        except HTTPException as exc:
            if exc.status_code == status.HTTP_502_BAD_GATEWAY and attempt < 2:
                await asyncio.sleep(1.0)
                continue
            if exc.status_code == status.HTTP_401_UNAUTHORIZED:
                storage.clear()
                return AuthStatus(authenticated=False)
            raise exc

    return AuthStatus(authenticated=False)


@router.post("/token", response_model=AuthStatus)
async def login_with_token(payload: TokenLoginRequest, vk: VKDep) -> AuthStatus:
    """Accept an access_token captured from the vk.com OAuth redirect."""
    user_id = payload.user_id or 0
    if not user_id:
        try:
            response = await vk.call("users.get", payload.access_token)
            if isinstance(response, list) and response:
                user_id = int(response[0].get("id", 0))
        except VKError as exc:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail={"kind": "vk_error", "message": exc.message},
            ) from exc

    if not user_id:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            detail={"kind": "vk_error", "message": "Не удалось определить user_id"},
        )

    session = storage.Session(access_token=payload.access_token, user_id=user_id)

    if payload.remember:
        try:
            exchange_res = await vk.call(
                "auth.getExchangeToken",
                session.access_token,
                create_common_token=1,
                create_tier_tokens=0,
                api_id=2274003,
            )
            if exchange_res:
                new_token = exchange_res.get("common_token")
                if not new_token and "users_exchange_tokens" in exchange_res:
                    tokens = exchange_res["users_exchange_tokens"]
                    if tokens and isinstance(tokens, list):
                        new_token = tokens[0].get("common_token")
                if new_token:
                    session.refresh_token = new_token
                    logger.info("Successfully obtained exchange token before Kate blessing")
        except Exception as exc:
            logger.warning("Failed to obtain exchange token during login: %s", exc)

    refresh_result = await refresh_to_audio_token(session.access_token)
    if refresh_result.ok and refresh_result.refreshed_token:
        logger.info("FCM receipt blessing succeeded")
        session = storage.Session(
            access_token=refresh_result.refreshed_token,
            user_id=session.user_id,
            expires_at=session.expires_at,
            refresh_token=session.refresh_token,
        )
    else:
        logger.info("FCM receipt blessing skipped (%s)", refresh_result.error)

    has_audio = await _probe_audio(vk, session.access_token)
    if not has_audio:
        logger.warning("audio.get probe failed on token — audio gated")

    storage.save(session)
    return await _resolve_user(vk, session.access_token, has_audio=has_audio)


@router.post("/logout", response_model=AuthStatus)
async def logout() -> AuthStatus:
    storage.clear()
    return AuthStatus(authenticated=False)


@router.post("/validate")
async def validate_account(payload: ValidateRequest, vk: VKDep):
    print(f"BACKEND RECEIVED VALIDATE: login={payload.login}, captcha_sid={payload.captcha_sid}, success_token={'yes' if payload.success_token else 'no'}", flush=True)
    
    login = payload.login.strip()
    if login.isdigit():
        if login.startswith("8") and len(login) == 11:
            login = "+7" + login[1:]
        elif login.startswith("7") and len(login) == 11:
            login = "+" + login
        elif len(login) == 10:
            login = "+7" + login
            
    device_id = storage.get_device_id()
    
    for attempt in range(2):
        try:
            anonym_token = await vk.get_anonymous_token()
            params = {
                "login": login,
                "force_password": 0,
                "supported_ways": "callreset,codegen,email,password,push,sms",
                "flow_type": "auth_without_password",
                "api_id": 2274003,
                "v": "5.274",
                "sak_version": "1.112",
                "https": 1,
                "lang": "ru",
                "device_id": device_id,
                "access_token": anonym_token,
            }
            if payload.captcha_sid:
                params["captcha_sid"] = payload.captcha_sid
            if payload.captcha_key:
                params["captcha_key"] = payload.captcha_key
            if payload.success_token:
                params["success_token"] = payload.success_token

            response = await vk.call_anonymous("auth.validateAccount", params, sign=False)
            return response
        except VKError as exc:
            print(f"BACKEND VALIDATE VKError: code={exc.code}, msg={exc.message}, raw={exc.raw}", flush=True)
            if exc.code in (28, 5, 1114, 1117, -1) and attempt == 0:
                vk.clear_anonymous_token()
                continue
                
            # Download captcha if needed
            captcha_img_base64 = None
            if exc.code == 14 and exc.raw:
                raw_url = exc.raw.get("captcha_img")
                if raw_url:
                    captcha_img_base64 = await _download_captcha_base64(raw_url)

            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "kind": "vk_error",
                    "code": exc.code,
                    "message": exc.message,
                    "captcha_sid": exc.raw.get("captcha_sid") if exc.raw else None,
                    "captcha_img": captcha_img_base64,
                    "redirect_uri": exc.raw.get("redirect_uri") if exc.raw else None,
                }
            )


@router.post("/send-sms")
async def send_sms(payload: SendSmsRequest, vk: VKDep):
    print(f"BACKEND RECEIVED SEND SMS: sid={payload.sid}", flush=True)
    device_id = storage.get_device_id()
    
    for attempt in range(2):
        try:
            anonym_token = await vk.get_anonymous_token()
            params = {
                "sid": payload.sid,
                "sak_version": "1.112",
                "v": "5.274",
                "api_id": 2274003,
                "lang": "ru",
                "device_id": device_id,
                "access_token": anonym_token,
                "https": 1,
            }
            response = await vk.call_anonymous("ecosystem.sendOtpSms", params, sign=False)
            return response
        except VKError as exc:
            print(f"BACKEND SEND SMS VKError: code={exc.code}, msg={exc.message}, raw={exc.raw}", flush=True)
            if exc.code == 3615 or "code" in exc.message.lower():
                print("SendSms failed with 3615. Clearing device_id and anonymous token to bypass rate limit...", flush=True)
                storage.clear_device_id()
                vk.clear_anonymous_token()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "kind": "vk_error",
                        "code": exc.code,
                        "message": "Не удалось отправить SMS (лимиты или VPN). Устройство сброшено, попробуйте войти ещё раз.",
                    }
                )
            if exc.code in (28, 5, 1114, 1117, -1) and attempt == 0:
                vk.clear_anonymous_token()
                continue
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "kind": "vk_error",
                    "code": exc.code,
                    "message": exc.message,
                    "captcha_sid": exc.raw.get("captcha_sid") if exc.raw else None,
                    "redirect_uri": exc.raw.get("redirect_uri") if exc.raw else None,
                }
            )


@router.post("/verification-methods")
async def get_verification_methods(payload: SendSmsRequest, vk: VKDep):
    print(f"BACKEND RECEIVED GET VERIFICATION METHODS: sid={payload.sid}", flush=True)
    device_id = storage.get_device_id()
    
    for attempt in range(2):
        try:
            anonym_token = await vk.get_anonymous_token()
            params = {
                "sid": payload.sid,
                "v": "5.274",
                "api_id": 2274003,
                "lang": "ru",
                "device_id": device_id,
                "access_token": anonym_token,
                "https": 1,
            }
            response = await vk.call_anonymous("ecosystem.getVerificationMethods", params, sign=False)
            return response
        except VKError as exc:
            print(f"BACKEND VERIFICATION METHODS VKError: code={exc.code}, msg={exc.message}", flush=True)
            if exc.code in (28, 5, 1114, 1117, -1) and attempt == 0:
                vk.clear_anonymous_token()
                continue
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "kind": "vk_error",
                    "code": exc.code,
                    "message": exc.message,
                }
            )

@router.post("/send-callreset")
async def send_callreset(payload: SendSmsRequest, vk: VKDep):
    print(f"BACKEND RECEIVED SEND CALLRESET: sid={payload.sid}", flush=True)
    device_id = storage.get_device_id()
    
    for attempt in range(2):
        try:
            anonym_token = await vk.get_anonymous_token()
            params = {
                "sid": payload.sid,
                "sak_version": "1.112",
                "v": "5.274",
                "api_id": 2274003,
                "lang": "ru",
                "device_id": device_id,
                "access_token": anonym_token,
                "https": 1,
            }
            response = await vk.call_anonymous("ecosystem.sendOtpCallReset", params, sign=False)
            if isinstance(response, dict):
                response["verification_method"] = "callreset"
            return response
        except VKError as exc:
            print(f"BACKEND SEND CALLRESET VKError: code={exc.code}, msg={exc.message}, raw={exc.raw}", flush=True)
            if exc.code == 3615 or "code" in exc.message.lower():
                print("SendCallReset failed with 3615. Clearing device_id and anonymous token to bypass rate limit...", flush=True)
                storage.clear_device_id()
                vk.clear_anonymous_token()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail={
                        "kind": "vk_error",
                        "code": exc.code,
                        "message": "Не удалось сделать звонок (лимиты или VPN). Устройство сброшено, попробуйте войти ещё раз.",
                    }
                )
            if exc.code in (28, 5, 1114, 1117, -1) and attempt == 0:
                vk.clear_anonymous_token()
                continue
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "kind": "vk_error",
                    "code": exc.code,
                    "message": exc.message,
                    "captcha_sid": exc.raw.get("captcha_sid") if exc.raw else None,
                    "redirect_uri": exc.raw.get("redirect_uri") if exc.raw else None,
                }
            )


@router.post("/send-email")
async def send_email(payload: SendSmsRequest, vk: VKDep):
    print(f"BACKEND RECEIVED SEND EMAIL: sid={payload.sid}", flush=True)
    device_id = storage.get_device_id()
    
    for attempt in range(2):
        try:
            anonym_token = await vk.get_anonymous_token()
            params = {
                "sid": payload.sid,
                "sak_version": "1.112",
                "v": "5.274",
                "api_id": 2274003,
                "lang": "ru",
                "device_id": device_id,
                "access_token": anonym_token,
                "https": 1,
            }
            response = await vk.call_anonymous("ecosystem.sendOtpEmail", params, sign=False)
            return response
        except VKError as exc:
            print(f"BACKEND SEND EMAIL VKError: code={exc.code}, msg={exc.message}, raw={exc.raw}", flush=True)
            if exc.code in (28, 5, 1114, 1117, -1) and attempt == 0:
                vk.clear_anonymous_token()
                continue
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "kind": "vk_error",
                    "code": exc.code,
                    "message": exc.message,
                    "captcha_sid": exc.raw.get("captcha_sid") if exc.raw else None,
                    "redirect_uri": exc.raw.get("redirect_uri") if exc.raw else None,
                }
            )


@router.post("/send-push")
async def send_push(payload: SendSmsRequest, vk: VKDep):
    print(f"BACKEND RECEIVED SEND PUSH: sid={payload.sid}", flush=True)
    device_id = storage.get_device_id()
    
    for attempt in range(2):
        try:
            anonym_token = await vk.get_anonymous_token()
            params = {
                "sid": payload.sid,
                "sak_version": "1.112",
                "v": "5.274",
                "api_id": 2274003,
                "lang": "ru",
                "device_id": device_id,
                "access_token": anonym_token,
                "https": 1,
            }
            response = await vk.call_anonymous("ecosystem.sendOtpPush", params, sign=False)
            return response
        except VKError as exc:
            print(f"BACKEND SEND PUSH VKError: code={exc.code}, msg={exc.message}, raw={exc.raw}", flush=True)
            if exc.code in (28, 5, 1114, 1117, -1) and attempt == 0:
                vk.clear_anonymous_token()
                continue
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "kind": "vk_error",
                    "code": exc.code,
                    "message": exc.message,
                    "captcha_sid": exc.raw.get("captcha_sid") if exc.raw else None,
                    "redirect_uri": exc.raw.get("redirect_uri") if exc.raw else None,
                }
            )


@router.post("/send-max")
async def send_max(payload: SendSmsRequest, vk: VKDep):
    print(f"BACKEND RECEIVED SEND MAX: sid={payload.sid}", flush=True)
    device_id = storage.get_device_id()
    
    for attempt in range(2):
        try:
            anonym_token = await vk.get_anonymous_token()
            params = {
                "sid": payload.sid,
                "sak_version": "1.112",
                "v": "5.274",
                "api_id": 2274003,
                "lang": "ru",
                "device_id": device_id,
                "access_token": anonym_token,
                "https": 1,
            }
            response = await vk.call_anonymous("ecosystem.sendOtpMax", params, sign=False)
            return response
        except VKError as exc:
            print(f"BACKEND SEND MAX VKError: code={exc.code}, msg={exc.message}, raw={exc.raw}", flush=True)
            if exc.code in (28, 5, 1114, 1117, -1) and attempt == 0:
                vk.clear_anonymous_token()
                continue
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "kind": "vk_error",
                    "code": exc.code,
                    "message": exc.message,
                    "captcha_sid": exc.raw.get("captcha_sid") if exc.raw else None,
                    "redirect_uri": exc.raw.get("redirect_uri") if exc.raw else None,
                }
            )


@router.post("/check-otp")
async def check_otp(payload: CheckOtpRequest, vk: VKDep):
    print(f"BACKEND RECEIVED CHECK OTP: sid={payload.sid}, code={payload.code}, verification_method={payload.verification_method}", flush=True)
    device_id = storage.get_device_id()
    
    for attempt in range(2):
        try:
            anonym_token = await vk.get_anonymous_token()
            params = {
                "sid": payload.sid,
                "sak_version": "1.112",
                "code": payload.code,
                "verification_method": payload.verification_method,
                "api_id": 2274003,
                "v": "5.274",
                "lang": "ru",
                "device_id": device_id,
                "access_token": anonym_token,
                "https": 1,
            }
            response = await vk.call_anonymous("ecosystem.checkOtp", params, sign=False)
            return response
        except VKError as exc:
            print(f"BACKEND CHECK OTP VKError: code={exc.code}, msg={exc.message}, raw={exc.raw}", flush=True)
            if exc.code in (28, 5, 1114, 1117, -1) and attempt == 0:
                vk.clear_anonymous_token()
                continue
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "kind": "vk_error",
                    "code": exc.code,
                    "message": exc.message,
                    "captcha_sid": exc.raw.get("captcha_sid") if exc.raw else None,
                    "redirect_uri": exc.raw.get("redirect_uri") if exc.raw else None,
                }
            )


@router.post("/confirm", response_model=AuthStatus)
async def confirm_auth(payload: ConfirmRequest, vk: VKDep) -> AuthStatus:
    print(f"BACKEND RECEIVED CONFIRM: grant_type={payload.grant_type}, username={payload.username}, code={payload.code}, sid={payload.sid}", flush=True)
    device_id = storage.get_device_id()
    anonym_token = await vk.get_anonymous_token()
    
    grant_type = payload.grant_type
    if grant_type in ("phone_code", "auth_code"):
        grant_type = "without_password"
        
    oauth_payload = {
        "grant_type": grant_type,
        "client_id": 2274003,
        "client_secret": "hHbZxrka2uZ6jB1inYsH",
        "username": payload.username,
        "device_id": device_id,
        "2fa_supported": 1,
        "scope": "all",
        "anonymous_token": anonym_token,
        "v": "5.274",
        "https": 1,
    }
    if payload.sid:
        oauth_payload["sid"] = payload.sid
    if payload.captcha_sid:
        oauth_payload["captcha_sid"] = payload.captcha_sid
    if payload.captcha_key:
        oauth_payload["captcha_key"] = payload.captcha_key
    if payload.grant_type == "password":
        oauth_payload["password"] = payload.password
        if payload.code:
            oauth_payload["code"] = payload.code
    elif payload.grant_type in ("phone_code", "auth_code"):
        oauth_payload["code"] = payload.code

    print(f"BACKEND SENDING OAUTH/TOKEN PAYLOAD: {oauth_payload}", flush=True)

    try:
        resp = await vk._client.post("https://oauth.vk.com/token", data=oauth_payload)
        resp_json = resp.json()
        print(f"BACKEND OAUTH/TOKEN RESPONSE: {resp_json}", flush=True)
    except Exception as exc:
        print(f"BACKEND OAUTH/TOKEN NETWORK ERROR: {exc}", flush=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"kind": "network_error", "message": f"Ошибка сети при запросе к oauth/token: {exc}"}
        ) from exc

    if "error" in resp_json:
        err = resp_json.get("error")
        err_desc = resp_json.get("error_description", "Unknown OAuth error")
        print(f"BACKEND OAUTH/TOKEN ERROR RESULT: err={err}, desc={err_desc}", flush=True)
        
        captcha_img = resp_json.get("captcha_img")
        if captcha_img:
            captcha_img = await _download_captcha_base64(captcha_img)
            
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "kind": "oauth_error",
                "error": err,
                "message": err_desc,
                "validation_type": resp_json.get("validation_type"),
                "validation_sid": resp_json.get("validation_sid"),
                "phone_mask": resp_json.get("phone_mask"),
                "masked_email": resp_json.get("masked_email"),
                "captcha_sid": resp_json.get("captcha_sid"),
                "captcha_img": captcha_img,
            }
        )

    if "access_token" not in resp_json:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"kind": "auth_error", "message": "Токен не был получен"}
        )

    session = storage.Session(
        access_token=resp_json["access_token"],
        user_id=int(resp_json.get("user_id", 0)),
        refresh_token=resp_json.get("refresh_token")
    )

    has_audio = await _probe_audio(vk, session.access_token)
    if payload.remember:
        if not session.refresh_token:
            try:
                exchange_res = await vk.call(
                    "auth.getExchangeToken",
                    session.access_token,
                    create_common_token=1,
                    create_tier_tokens=0,
                    api_id=2274003,
                )
                if exchange_res:
                    new_token = exchange_res.get("common_token")
                    if not new_token and "users_exchange_tokens" in exchange_res:
                        tokens = exchange_res["users_exchange_tokens"]
                        if tokens and isinstance(tokens, list):
                            new_token = tokens[0].get("common_token")
                    if new_token:
                        session.refresh_token = new_token
                        logger.info("Successfully obtained exchange token for background refresh")
            except Exception as exc:
                logger.warning("Failed to obtain exchange token: %s", exc)
        storage.save(session)

    return await _resolve_user(vk, session.access_token, has_audio=has_audio)
