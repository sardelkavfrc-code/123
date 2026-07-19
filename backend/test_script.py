
import sys
try:
    import asyncio
    from app import storage
    from app.vk.client import VKClient
    import time
    import json

    async def test():
        session = storage.load()
        if not session or not session.access_token:
            print('No token')
            return
        vk = VKClient()
        event = {
            'e': 'audio_play',
            'audio_id': '4082873_456242205',
            'source': 'my',
            'uuid': 123456789,
            'duration': 180,
            'start_time': int(time.time())
        }
        events_json = json.dumps([event], separators=(',', ':'))
        print('Sending events:', events_json)
        
        try:
            resp = await vk.call('stats.trackEvents', session.access_token, events=events_json)
            print('Response:', resp)
        except Exception as e:
            print('Error:', e)
            
    asyncio.run(test())
except Exception as e:
    print('GLOBAL ERROR:', e)

