import asyncio
import json
from pathlib import Path
import sys
import os

# add backend to path
sys.path.insert(0, os.path.abspath("backend"))

from app.vk.client import VKClient
from app.config import Settings

async def main():
    settings = Settings()
    settings.vk_user_agent = "VKAndroidApp/8.183-54468 (Android 11; SDK 30; armeabi-v7a; Realme RMX3263; ru; 320x720)"
    
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
    
    my_music_sec_id = None
    for sec in sections:
        if sec.get("title") == "Главная":
            my_music_sec_id = sec.get("id")
            break
            
    print("Calling catalog.getAudio...")
    catalog = await vk.call("catalog.getAudio", token)
    
    with open("dump_catalog.json", "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=2)
        
    print("Dumped to dump_catalog.json")
    
if __name__ == "__main__":
    asyncio.run(main())
