import asyncio, sys, os
sys.path.append(r'c:\Users\ohlamon\Desktop\vkplayer\123\backend')
from app import storage
from app.vk.client import VKClient

async def main():
    session = storage.load()
    vk = VKClient()
    
    catalog_raw = await vk.call("catalog.getAudio", session.access_token)
    sections = catalog_raw.get("catalog", {}).get("sections", [])
    
    target_section_id = None
    for sec in sections:
        url = sec.get("url", "")
        if "explore" in url or "general" in url or sec.get("title") in ["Обзор", "Главная"]:
            target_section_id = sec.get("id")
            break
            
    if not target_section_id and sections:
        target_section_id = sections[0].get("id")
        
    section_raw = await vk.call("catalog.getSection", session.access_token, section_id=target_section_id, need_blocks=1)
    blocks = section_raw.get("section", {}).get("blocks", [])
    
    current_title = ""
    for b in blocks:
        title = b.get("layout", {}).get("title")
        if title: current_title = title
        if b.get("layout", {}).get("name") == "crop_slider":
            print("Block Title:", current_title)
            for a in b.get("actions", []):
                print(f"  Action: {a.get('title')}, Images: {a.get('images', [])}")

asyncio.run(main())
