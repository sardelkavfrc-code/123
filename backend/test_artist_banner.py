import asyncio
from app.vk.client import VKClient

TOKEN = "vk1.a.N70u4cawe0UbcrXpwVJLGyJ5Ql7fCSHz_NFfUs6cpWc6SfVA-aKKgRU55vm6zowxUwML3Rz6hw6lV6UmzmbCg4ZHV6fRTilBLPgQ6pyZ9D19Yrs1Me-nFFeKw31ULYdXIxnkeZeSSF5YmPkh5xbZoAfw-XPUcCiHWPvY2PDRiEQKNikMz2BUMUjkbTQaA3N2M6Xcl51Kidfo2FHAqTL0Gw"

async def main():
    vk = VKClient()
    try:
        # Search for artist
        res = await vk.call("audio.search", TOKEN, q="Big Baby Tape", performer_only=1, count=1)
        artist_id = res["items"][0]["main_artists"][0]["id"]
        print("Artist ID:", artist_id)
        
        # Get artist info
        cat = await vk.call("catalog.getAudioArtist", TOKEN, artist_id=artist_id)
        sec_id = cat["catalog"]["sections"][0]["id"]
        sec = await vk.call("catalog.getSection", TOKEN, section_id=sec_id)
        import json
        with open("artist_section.json", "w", encoding="utf-8") as f:
            f.write(json.dumps(sec, indent=2, ensure_ascii=False))
        print("Done!")
    except Exception as e:
        print("Error:", e)

asyncio.run(main())
