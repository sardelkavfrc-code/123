import os
import sys
import httpx
import json

sys.path.insert(0, os.path.dirname(__file__))
from app.storage import load

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
    r1 = req("catalog.getAudio")
    if 'response' in r1:
        sections = r1['response']['catalog']['sections']
        for sec in sections:
            sid = sec.get('id')
            title = sec.get('title')
            if title == "Главная":
                r2 = req("catalog.getSection", {"section_id": sid})
                if 'response' in r2:
                    blocks = r2['response']['section']['blocks']
                    found = False
                    for b in blocks:
                        btitle = b.get('layout', {}).get('title', '')
                        if 'настроени' in str(btitle).lower() or 'заняти' in str(btitle).lower():
                            print("Found header block:", btitle)
                            found = True
                        elif found and b.get('data_type') == 'music_playlists':
                            print("Playlists block found:")
                            with open("moods_block.json", "w", encoding="utf-8") as f:
                                json.dump(b, f, ensure_ascii=False, indent=2)
                            print("Written to moods_block.json")
                            break

if __name__ == "__main__":
    run()
