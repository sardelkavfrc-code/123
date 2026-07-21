import json
d = json.load(open('explore_dump.json', encoding='utf-8'))
for b in d['section']['blocks']:
    title = b.get('layout', {}).get('title') or b.get('title', '')
    name = b.get('layout', {}).get('name')
    dtype = b.get('data_type')
    audios_ids = b.get('audios_ids', [])
    next_from = b.get('next_from')
    print(f"Title: {title} | Type: {dtype} | Layout: {name} | IDs count: {len(audios_ids)} | Next: {next_from}")
