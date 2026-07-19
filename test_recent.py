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
    
    try:
        print("Calling audio.getRecent...")
        response = await vk.call("audio.getRecent", token)
        print(response)
    except Exception as e:
        print(f"Error calling audio.getRecent: {e}")
        
    try:
        print("\nCalling catalog.getRecent...")
        response = await vk.call("catalog.getRecent", token)
        print(response)
    except Exception as e:
        print(f"Error calling catalog.getRecent: {e}")

if __name__ == "__main__":
    asyncio.run(main())
