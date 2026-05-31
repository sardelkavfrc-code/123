import os
import sys
import asyncio

sys.path.insert(0, os.path.dirname(__file__))
from app.routers.audio import moods
from app.storage import load

class MockVK:
    async def call(self, method, token, **params):
        import httpx
        params['access_token'] = token
        params['v'] = '5.131'
        r = httpx.post(f"https://api.vk.com/method/{method}", data=params)
        return r.json().get('response', {})

class MockSession:
    def __init__(self):
        self.access_token = load().access_token

async def run():
    vk = MockVK()
    session = MockSession()
    try:
        res = await moods(vk, session)
        print("Success!", len(res.items))
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run())
