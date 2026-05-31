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
            print("Section:", sec.get('id'), sec.get('title'))
            blocks = sec.get('blocks', [])
            for b in blocks:
                print("  Block:", b.get('id'), b.get('title'), b.get('data_type'))
                if b.get('layout'):
                    print("    Layout:", b.get('layout').get('name'))

if __name__ == "__main__":
    run()
