import asyncio
import os
import json
import time
from pathlib import Path
from app.vk.client import VKClient
from app.vk.exceptions import VKError

def get_session():
    path = Path.home() / ".vk-music-player" / "session.json"
    if not path.exists():
        raise FileNotFoundError("Session file not found at " + str(path))
    return json.loads(path.read_text(encoding="utf-8"))

async def fetch_execute(vk, token, owner_id, offset, count_per_chunk, num_chunks):
    code = f"""
    var offset = parseInt(Args.offset);
    var owner_id = parseInt(Args.owner_id);
    var count = {count_per_chunk};
    var num_chunks = {num_chunks};
    var chunks = [];
    var i = 0;
    while (i < num_chunks) {{
        var res = API.audio.get({{"owner_id": owner_id, "offset": offset + i * count, "count": count}});
        if (!!res) {{
            if (!!res.items) {{
                chunks.push(res.items);
            }}
        }}
        i = i + 1;
    }}
    return chunks;
    """
    return await vk.call("execute", token, code=code, offset=offset, owner_id=owner_id)

async def run_strategy_sequential(vk, token, owner_id, total_count):
    # Strategy 1: Sequential requests using a single execute call of up to 25 chunks (5000 tracks)
    start_time = time.perf_counter()
    all_items = []
    chunk_size = 200
    chunks_per_execute = 25
    tracks_per_execute = chunk_size * chunks_per_execute # 5000
    
    offset = 0
    while offset < total_count:
        remaining_tracks = total_count - offset
        num_chunks = min(chunks_per_execute, (remaining_tracks + chunk_size - 1) // chunk_size)
        resp = await fetch_execute(vk, token, owner_id, offset, chunk_size, num_chunks)
        if not resp:
            break
        for chunk in resp:
            if chunk:
                all_items.extend(chunk)
        offset += num_chunks * chunk_size
        
        # Prevent hitting rate limits if we loop
        if offset < total_count:
            await asyncio.sleep(0.5)
            
    elapsed = time.perf_counter() - start_time
    return elapsed, len(all_items)

async def run_strategy_parallel(vk, token, owner_id, total_count, num_partitions):
    # Strategy 2: Parallel execute calls running concurrently using asyncio.gather
    start_time = time.perf_counter()
    chunk_size = 200
    
    # Calculate how many total chunks we need
    total_chunks = (total_count + chunk_size - 1) // chunk_size
    
    # Distribute chunks across partitions
    chunks_per_partition = (total_chunks + num_partitions - 1) // num_partitions
    
    tasks = []
    for p in range(num_partitions):
        chunk_offset = p * chunks_per_partition
        if chunk_offset >= total_chunks:
            break
        
        actual_chunks = min(chunks_per_partition, total_chunks - chunk_offset)
        offset = chunk_offset * chunk_size
        
        tasks.append(fetch_execute(vk, token, owner_id, offset, chunk_size, actual_chunks))
        
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    all_items = []
    for res in results:
        if isinstance(res, Exception):
            print(f"Partition call failed: {res}")
            continue
        if res:
            for chunk in res:
                if chunk:
                    all_items.extend(chunk)
                    
    elapsed = time.perf_counter() - start_time
    return elapsed, len(all_items)

async def main():
    session = get_session()
    token = session["access_token"]
    user_id = session["user_id"]
    
    vk = VKClient()
    try:
        # Get total track count first
        print("Fetching total track count...")
        total_count = await vk.call("audio.get", token, owner_id=user_id, count=1)
        total_tracks = total_count.get("count", 0)
        print(f"Total tracks in library: {total_tracks}")
        
        strategies = {
            "1. Sequential Execute": lambda: run_strategy_sequential(vk, token, user_id, total_tracks),
            "2. Parallel Execute (2 partitions)": lambda: run_strategy_parallel(vk, token, user_id, total_tracks, 2),
            "3. Parallel Execute (3 partitions)": lambda: run_strategy_parallel(vk, token, user_id, total_tracks, 3),
            "4. Parallel Execute (4 partitions)": lambda: run_strategy_parallel(vk, token, user_id, total_tracks, 4),
            "5. Parallel Execute (5 partitions)": lambda: run_strategy_parallel(vk, token, user_id, total_tracks, 5),
            "6. Parallel Execute (6 partitions)": lambda: run_strategy_parallel(vk, token, user_id, total_tracks, 6),
        }
        
        results_summary = {name: [] for name in strategies}
        
        iterations = 30
        print(f"\nStarting benchmark: {iterations} iterations for each strategy. This may take a few minutes...")
        
        for i in range(iterations):
            print(f"\n--- Iteration {i+1}/{iterations} ---")
            for name, runner in strategies.items():
                try:
                    elapsed, count = await runner()
                    results_summary[name].append(elapsed)
                    print(f"{name}: {elapsed:.3f}s (Fetched {count} tracks)")
                except Exception as exc:
                    print(f"Strategy {name} failed: {exc}")
                # Keep API happy between strategies
                await asyncio.sleep(0.8)
            # Sleep longer between iterations
            await asyncio.sleep(1.5)
            
        print("\n=== BENCHMARK RESULTS (Average over 30 runs) ===")
        for name, times in results_summary.items():
            if times:
                avg = sum(times) / len(times)
                min_t = min(times)
                max_t = max(times)
                print(f"{name:35} | Avg: {avg:6.3f}s | Min: {min_t:6.3f}s | Max: {max_t:6.3f}s")
            else:
                print(f"{name:35} | Failed all runs")
                
    finally:
        await vk.aclose()

if __name__ == "__main__":
    asyncio.run(main())
