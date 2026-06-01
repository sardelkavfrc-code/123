import asyncio
import httpx

TOKEN = "vk1.a.fd9KZJfrRXCdpc0H6p9TAcv_kDdjM_BQDaCREuYHMZQk08_yOdhhp1posEG-R1T1yBYpnR5Y7BROJqsxjO-PaA1-pH_JGxIZofcO6gbRZIez1j-Ucsxb_DrHiJHD4OUkBBw0Fp1E_oGIasiKMtGqT-IJZ4Se0UO385H14rD_3Q3Z70zWiMxa4Xwg4y_eN_ZQpke4QI0QSHEJQu1tr6YyTQ"

async def test_albums():
    async with httpx.AsyncClient() as client:
        # 1. Let's try to get an artist or albums of an artist.
        # But wait, what artist? Let's just search for an artist first.
        res = await client.post("https://api.vk.com/method/audio.search", data={
            "q": "Oxxxymiron",
            "access_token": TOKEN,
            "v": "5.207"
        })
        print("Search:", res.json().get("response", {}).get("items", [])[:1])
        
        # Oxxxymiron owner_id might be different, let's just use a hardcoded id or user's albums.
        # But user wants artist albums? Let's get artist by id? "audio.getArtistById"?
        # Wait, the user said "albums don't show up, check how to get them with covers".
        
        # Let's see what user albums look like.
        res = await client.post("https://api.vk.com/method/audio.getPlaylists", data={
            "count": 5,
            "access_token": TOKEN,
            "v": "5.207"
        })
        print("Playlists:", res.json())

        # Let's search playlists
        res = await client.post("https://api.vk.com/method/audio.searchPlaylists", data={
            "q": "Oxxxymiron",
            "count": 5,
            "access_token": TOKEN,
            "v": "5.207"
        })
        print("Search Playlists:", res.json())

if __name__ == "__main__":
    asyncio.run(test_albums())
