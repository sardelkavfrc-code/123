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
        
    versions = ["5.90", "5.131", "5.183", "5.210"]
    for v in versions:
        print(f"\n--- Testing API version {v} ---")
        settings.vk_api_version = v
        vk = VKClient(settings)
        try:
            catalog = await vk.call("catalog.getAudio", token)
            sections = catalog.get("catalog", {}).get("sections", [])
            found = False
            for sec in sections:
                if sec.get("title") == "Моя музыка":
                    sec_id = sec.get("id")
                    section_data = await vk.call("catalog.getSection", token, section_id=sec_id, need_blocks=1)
                    blocks = section_data.get("section", {}).get("blocks", [])
                    for b in blocks:
                        if b.get("title") == "Недавно прослушанные" or "block=recent" in b.get("url", ""):
                            print(f"!!! FOUND RECENT IN v={v}")
                            found = True
            if not found:
                print(f"No recent block found in v={v}")
        except Exception as e:
            print(f"Error for v={v}: {e}")

if __name__ == "__main__":
    asyncio.run(main())
