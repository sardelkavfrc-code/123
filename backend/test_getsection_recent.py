import asyncio
import json
import sys
import os

sys.path.insert(0, os.path.abspath("backend"))

from app.vk.client import VKClient
from app.config import Settings

async def main():
    settings = Settings()
    session_file = settings.session_file
    with open(session_file, "r") as f:
        sess_data = json.load(f)
        token = sess_data.get("access_token")
        
    vk = VKClient(settings)
    
    try:
        catalog = await vk.call("catalog.getAudio", token, url="https://vk.com/audio?section=recent")
        sections = catalog.get("catalog", {}).get("sections", [])
        sec_id = None
        for sec in sections:
            if "recent" in sec.get("url", ""):
                sec_id = sec.get("id")
                break
                
        if sec_id:
            print("Found section ID, fetching getSection...")
            section_data = await vk.call("catalog.getSection", token, section_id=sec_id, need_blocks=1)
            with open("dump_section_recent_real.json", "w", encoding="utf-8") as f:
                json.dump(section_data, f, ensure_ascii=False, indent=2)
            print("Dumped to dump_section_recent_real.json")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
