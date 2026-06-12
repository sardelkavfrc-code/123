import asyncio
import logging
from typing import Optional
from pydantic import BaseModel
from pypresence import AioPresence, InvalidID, PipeClosed

log = logging.getLogger(__name__)

class RPCState(BaseModel):
    is_playing: bool
    custom_text: str = "Слушает музыку"
    title: Optional[str] = None
    artist: Optional[str] = None
    cover_url: Optional[str] = None
    duration: Optional[int] = None
    position: Optional[int] = None

CLIENT_ID = "1515030438270468268"

class DiscordRPCManager:
    def __init__(self):
        self.presence: Optional[AioPresence] = None
        self.connected = False
        self._lock = asyncio.Lock()

    async def connect(self) -> bool:
        if self.connected:
            return True
            
        if self.presence:
            try:
                await self.presence.close()
            except Exception:
                pass
                
        try:
            self.presence = AioPresence(CLIENT_ID)
            await self.presence.connect()
            self.connected = True
            log.info(f"Connected to Discord RPC with client ID {CLIENT_ID}")
            return True
        except Exception as e:
            log.error(f"Failed to connect to Discord RPC: {e}")
            self.connected = False
            self.presence = None
            return False

    async def update(self, state: RPCState):
        async with self._lock:
            if not self.connected:
                success = await self.connect()
                if not success:
                    return

            try:
                if not state.is_playing:
                await self.presence.clear()
                return

            kwargs = {
                "details": state.custom_text,
            }
            if state.title:
                kwargs["state"] = f"{state.artist} - {state.title}" if state.artist else state.title
                kwargs["large_text"] = state.title
                kwargs["large_image"] = state.cover_url or "https://raw.githubusercontent.com/sardelkavfrc-code/123/main/assets/logo.png"
            else:
                kwargs["large_image"] = "https://raw.githubusercontent.com/sardelkavfrc-code/123/main/assets/logo.png"
                
            # Add start time and end time if we have duration
            # To show elapsed time, we just set start
            if state.position is not None and state.title:
                import time
                current_time = int(time.time())
                kwargs["start"] = current_time - state.position
                if state.duration:
                    kwargs["end"] = kwargs["start"] + state.duration

            await self.presence.update(**kwargs)
        except PipeClosed:
            self.connected = False
            log.warning("Discord RPC pipe closed")
        except Exception as e:
            log.error(f"Error updating Discord RPC: {e}")
            self.connected = False

    async def clear(self):
        async with self._lock:
            if self.connected and self.presence:
                try:
                    await self.presence.clear()
                except Exception:
                    self.connected = False

    async def close(self):
        async with self._lock:
            if self.connected and self.presence:
                try:
                    await self.presence.close()
                except Exception:
                    pass
                self.connected = False

rpc_manager = DiscordRPCManager()
