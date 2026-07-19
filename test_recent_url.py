import asyncio
import json
import sys
import os

# add backend to path
sys.path.insert(0, os.path.abspath("backend"))

from app.vk.client import VKClient
from app.config import Settings

async def main():
    settings = Settings()
    settings.vk_user_agent = "KateMobileAndroid/113.1 lite-462 (Android 14; SDK 34; arm64-v8a; Realme; ru; 320x720)"
    
    session_file = settings.session_file
    if not session_file.exists():
        print("No session file")
        return
        
    with open(session_file, "r") as f:
        sess_data = json.load(f)
        token = sess_data.get("access_token")
        
    if not token:
        print("No token")
        return
        
    vk = VKClient(settings)
    
    print("Calling catalog.getSection with url...")
    try:
        section_data = await vk.call(
            "catalog.getSection",
            token,
            section_id="https://vk.com/audio?section=recent",
            need_blocks=1,
        )
        
        with open("dump_recent_section.json", "w", encoding="utf-8") as f:
            json.dump(section_data, f, ensure_ascii=False, indent=2)
            
        print("Dumped to dump_recent_section.json")
    except Exception as e:
        print(f"Error: {e}")
    
if __name__ == "__main__":
    asyncio.run(main())
