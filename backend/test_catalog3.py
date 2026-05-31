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
        
        # Dump catalog to file
        with open("catalog_dump.json", "w", encoding="utf-8") as f:
            json.dump(r1, f, ensure_ascii=False, indent=2)
            
        print("Catalog saved to catalog_dump.json")
        
        main_sec = next((s for s in sections if s.get('title') == 'Главная'), sections[0])
        print(f"Fetching section {main_sec.get('title')} ({main_sec.get('id')})")
        r2 = req("catalog.getSection", {"section_id": main_sec.get('id')})
        
        with open("section_dump.json", "w", encoding="utf-8") as f:
            json.dump(r2, f, ensure_ascii=False, indent=2)
        print("Section saved to section_dump.json")
        
        blocks = r2.get('response', {}).get('section', {}).get('blocks', [])
        for b in blocks:
            print("Block:", b.get('layout', {}).get('title'), b.get('data_type'), b.get('meta'))

if __name__ == "__main__":
    run()
