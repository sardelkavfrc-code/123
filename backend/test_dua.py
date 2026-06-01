import os
import sys
import httpx
from app.storage import load

sys.stdout.reconfigure(encoding='utf-8')
session = load()
token = session.access_token

def req(method, params=None):
    if params is None:
        params = {}
    params['access_token'] = token
    params['v'] = '5.131'
    resp = httpx.post(f"https://api.vk.com/method/{method}", data=params)
    return resp.json()

def run():
    res = req('audio.search', {'q': 'Dua Lipa', 'count': 1})
    artist_id = res['response']['items'][0]['main_artists'][0]['id']
    
    catalog_raw = req('catalog.getAudio', {'artist_id': artist_id, 'need_blocks': 1})
    print(catalog_raw.keys())
    if 'response' in catalog_raw:
        sections = catalog_raw['response'].get('catalog', {}).get('sections', [])
        for s in sections:
            print("Section:", s.get('id'), "title:", s.get('title'))
    else:
        print("Error:", catalog_raw)

if __name__ == "__main__":
    run()
