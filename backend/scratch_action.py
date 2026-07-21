import asyncio
import json
from app.vk.client import VKClient
from app.storage import load

async def main():
    session = load()
    if not session:
        print("No token found")
        return
    token = session.access_token

    vk = VKClient()
    print(f"Token: {token[:10]}...")
    catalog_raw = await vk.call("catalog.getAudio", token)
    sections = catalog_raw.get("catalog", {}).get("sections", [])
    
    target_section_id = None
    for sec in sections:
        url = sec.get("url", "")
        if "explore" in url or "general" in url or sec.get("title") in ["Обзор", "Главная"]:
            target_section_id = sec.get("id")
            break
            
    if not target_section_id and sections:
        target_section_id = sections[0].get("id")
        
    print(f"Target section id: {target_section_id}")
    section_raw = await vk.call("catalog.getSection", token, section_id=target_section_id, need_blocks=1)
    blocks = section_raw.get("section", {}).get("blocks", [])
    
    for b in blocks:
        b_type = b.get("data_type")
        title = b.get("layout", {}).get("title")
        subtitle = b.get("layout", {}).get("subtitle")
        print(f"Block: id={b.get('id')}, type={b_type}, layout.title={title}, subtitle={subtitle}, layout.name={b.get('layout', {}).get('name')}")
        if b_type == "action":
            actions = b.get("actions", [])
            for a in actions:
                print(f"  Action: title={a.get('title')}, action_sub={a.get('action')}")
        elif b_type == "music_recommended_playlists":
            pl_ids = b.get('playlists_ids', [])
            print(f"  Recommended playlists block! playlists_ids: {pl_ids}")
            # Check the first playlist in the global playlists_data
            for pid in pl_ids:
                if pid in [f"{p.get('owner_id')}_{p.get('id')}" for p in section_raw.get('playlists', [])]:
                    pl = next((p for p in section_raw.get('playlists', []) if f"{p.get('owner_id')}_{p.get('id')}" == pid), None)
                    print(f"  Playlist {pid} keys: {list(pl.keys())}")
                    break

if __name__ == "__main__":
    asyncio.run(main())
