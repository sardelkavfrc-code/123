import asyncio, sys, os
sys.path.append(r'c:\Users\ohlamon\Desktop\vkplayer\123\backend')
from app import storage
from app.vk.client import VKClient

async def main():
    session = storage.load()
    vk = VKClient()
    res = await vk.call('catalog.getAudioExplore', session.access_token)
    catalog = res.get('catalog', {})
    sections = catalog.get('sections', [])
    for sec in sections:
        for b in sec.get('blocks', []):
            if b.get('layout', {}).get('name') == 'crop_slider':
                print(b.get('layout', {}).get('title'))
                actions = b.get('actions', [])
                for a in actions:
                    images = a.get('images', [])
                    print(f"  {a.get('title')}: {len(images)} images")
                print('---')

asyncio.run(main())
