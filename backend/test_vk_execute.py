import asyncio
import os
import json
from app.vk.client import VKClient

async def main():
    vk = VKClient()
    # The frontend already has a token. Let's just use the router logic directly or print the script.
    print("Writing the script")
    script = """
    var offset = parseInt(Args.offset);
    var owner_id = parseInt(Args.owner_id);
    var count = 200;
    var total = 0;
    var items = [];
    var first = API.audio.get({"owner_id": owner_id, "offset": offset, "count": count});
    if (!first) { return {"count": 0, "items": []}; }
    total = first.count;
    items = first.items;
    var i = 1;
    while (i < 25 && items.length < total) {
        var res = API.audio.get({"owner_id": owner_id, "offset": offset + i * count, "count": count});
        if (res && res.items) {
            items = items + res.items;
        }
        i = i + 1;
    }
    return {"count": total, "items": items, "requests": i};
    """
    print("Script length:", len(script))

if __name__ == "__main__":
    asyncio.run(main())
