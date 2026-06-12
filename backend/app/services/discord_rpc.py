import asyncio
import logging
from typing import Optional
from pydantic import BaseModel
from pypresence import AioPresence, InvalidID, PipeClosed

log = logging.getLogger(__name__)

class RPCState(BaseModel):
    is_playing: bool
    title: str
    artist: str
    cover_url: Optional[str] = None
    custom_text: str = "Слушает музыку"
    duration: Optional[int] = None
    position: Optional[int] = None
    client_id: str = "383226320970055681"

class DiscordRPCManager:
    def __init__(self):
        self.presence: Optional[AioPresence] = None
        self.connected = False
        self.current_client_id: Optional[str] = None

    async def connect(self, client_id: str) -> bool:
        if self.connected and self.current_client_id == client_id:
            return True
            
        if self.presence:
            try:
                await self.presence.close()
            except Exception:
                pass
                
        try:
            self.presence = AioPresence(client_id)
            await self.presence.connect()
            self.connected = True
            self.current_client_id = client_id
            log.info(f"Connected to Discord RPC with client ID {client_id}")
            return True
        except Exception as e:
            log.error(f"Failed to connect to Discord RPC: {e}")
            self.connected = False
            self.presence = None
            return False

    async def update(self, state: RPCState):
        if not self.connected or self.current_client_id != state.client_id:
            success = await self.connect(state.client_id)
            if not success:
                return

        try:
            if not state.is_playing:
                await self.presence.clear()
                return

            kwargs = {
                "details": state.custom_text,
                "state": f"{state.artist} - {state.title}" if state.artist else state.title,
                "large_image": state.cover_url or "https://raw.githubusercontent.com/sardelkavfrc-code/123/main/assets/logo.png", # Fallback logo
                "large_text": state.title,
            }
            
            # Add start time and end time if we have duration
            # To show elapsed time, we just set start
            if state.position is not None:
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

    async def clear(self):
        if self.connected and self.presence:
            try:
                await self.presence.clear()
            except Exception:
                pass

    async def close(self):
        if self.connected and self.presence:
            try:
                await self.presence.close()
            except Exception:
                pass
            self.connected = False

rpc_manager = DiscordRPCManager()
