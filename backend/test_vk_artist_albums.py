import asyncio
import httpx

TOKEN = "vk1.a.fd9KZJfrRXCdpc0H6p9TAcv_kDdjM_BQDaCREuYHMZQk08_yOdhhp1posEG-R1T1yBYpnR5Y7BROJqsxjO-PaA1-pH_JGxIZofcO6gbRZIez1j-Ucsxb_DrHiJHD4OUkBBw0Fp1E_oGIasiKMtGqT-IJZ4Se0UO385H14rD_3Q3Z70zWiMxa4Xwg4y_eN_ZQpke4QI0QSHEJQu1tr6YyTQ"

async def test():
    async with httpx.AsyncClient() as client:
        # Get artist catalog
        res = await client.post("https://api.vk.com/method/catalog.getAudioArtist", data={
            "artist_id": "oxxxymiron",
            "access_token": TOKEN,
            "v": "5.207"
        })
        catalog_data = res.json()
        sections = catalog_data.get("response", {}).get("catalog", {}).get("sections", [])
        if not sections:
            print("No sections")
            return
            
        section_id = sections[0].get("id")
        
        # Get section
        res2 = await client.post("https://api.vk.com/method/catalog.getSection", data={
            "section_id": section_id,
            "access_token": TOKEN,
            "v": "5.207"
        })
        section_data = res2.json().get("response", {})
        blocks = section_data.get("section", {}).get("blocks", [])
        
        albums = []
        for b in blocks:
            if b.get("data_type") == "music_playlists":
                playlists_ids = b.get("playlists_ids", [])
                for pl in section_data.get("playlists", []):
                    pl_id = f"{pl.get('owner_id')}_{pl.get('id')}"
                    if pl_id in playlists_ids:
                        albums.append(pl.get("title"))
        
        print("Found albums:", albums)

if __name__ == "__main__":
    asyncio.run(test())
