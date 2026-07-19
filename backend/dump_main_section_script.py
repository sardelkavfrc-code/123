import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.abspath("backend"))

from app.vk.client import VKClient
from app.config import Settings

async def main():
    settings = Settings()
    # User's token from app
    session_file = settings.session_file
    with open(session_file, "r") as f:
        sess_data = json.load(f)
        token = sess_data.get("access_token")
        
    vk = VKClient(settings)
    
    catalog = await vk.call("catalog.getAudio", token)
    sections = catalog.get("catalog", {}).get("sections", [])
    
    sec_id = None
    for sec in sections:
        if sec.get("title") == "Главная":
            sec_id = sec.get("id")
            break
            
    print(f"Главная id: {sec_id}")
    
    section_data = await vk.call(
        "catalog.getSection",
        token,
        section_id=sec_id,
        need_blocks=1,
    )
    
    with open("dump_main_section.json", "w", encoding="utf-8") as f:
        json.dump(section_data, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    asyncio.run(main())
