import httpx

def search_genius(artist: str, title: str):
    query = f"{artist} {title}"
    url = "https://genius.com/api/search/multi"
    params = {"per_page": 1, "q": query}
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        "Accept": "application/json"
    }
    
    with httpx.Client() as client:
        r = client.get(url, params=params, headers=headers)
        if r.status_code == 200:
            data = r.json()
            sections = data.get("response", {}).get("sections", [])
            for sec in sections:
                if sec.get("type") == "song":
                    hits = sec.get("hits", [])
                    if hits:
                        hit = hits[0].get("result", {})
                        cover = hit.get("song_art_image_url")
                        print("Found cover:", cover)
                        return
            print("Not found in song hits.")
        else:
            print("HTTP error:", r.status_code)

if __name__ == "__main__":
    search_genius("Oxxxymiron", "Город под подошвой")
