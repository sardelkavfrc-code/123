from fastapi import APIRouter

from ..services.discord_rpc import RPCState, rpc_manager

router = APIRouter(prefix="/rpc", tags=["rpc"])

@router.post("/update")
async def update_rpc(state: RPCState):
    await rpc_manager.update(state)
    return {"status": "ok"}

@router.post("/clear")
async def clear_rpc():
    await rpc_manager.clear()
    return {"status": "ok"}
