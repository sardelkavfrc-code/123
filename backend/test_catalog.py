import os
import sys
import httpx

sys.path.insert(0, os.path.dirname(__file__))
from app.storage import load

session = load()
if not session:
    print("No session!")
    sys.exit(1)

token = session.access_token

def req(method, params=None):
    if params is None:
        params = {}
    params['access_token'] = token
    params['v'] = '5.131'
    resp = httpx.post(f"https://api.vk.com/method/{method}", data=params)
    return resp.json()

def run():
    print("Token starts with:", token[:10])
    
    print("\nTesting catalog.getAudio...")
    r1 = req("catalog.getAudio")
    print("catalog.getAudio:", "Error:", r1.get('error'))
    if 'response' in r1:
        print("Response keys:", r1['response'].keys())
        if 'catalog' in r1['response']:
            print("Catalog length:", len(r1['response']['catalog']['sections']))

    print("\nTesting audio.getCatalog...")
    r2 = req("audio.getCatalog")
    print("audio.getCatalog Error:", r2.get('error'))
    if 'response' in r2:
        print("Response keys:", r2['response'].keys())

    print("\nTesting catalog.getSection...")
    r3 = req("catalog.getSection", {"section_id": "explore"})
    print("catalog.getSection Error:", r3.get('error'))
    if 'response' in r3:
        print("Response keys:", r3['response'].keys())

if __name__ == "__main__":
    run()
