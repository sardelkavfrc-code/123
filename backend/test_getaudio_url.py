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
    
    try:
        catalog = await vk.call("catalog.getAudio", token, url="https://vk.com/audio?section=recent")
        with open("dump_getaudio_recent.json", "w", encoding="utf-8") as f:
            json.dump(catalog, f, ensure_ascii=False, indent=2)
        print("Success! Dumped to dump_getaudio_recent.json")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
