import os
import re

src_dir = r"c:\Users\ohlamon\Desktop\vkplayer\123\frontend\src"

pattern = re.compile(r'font-size:\s*(\d+(?:\.\d+)?)px')

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith('.vue') or f.endswith('.css'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            new_content = pattern.sub(r'font-size: calc(\1px * var(--font-scale, 1))', content)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as file:
                    file.write(new_content)
                print(f"Updated {path}")
