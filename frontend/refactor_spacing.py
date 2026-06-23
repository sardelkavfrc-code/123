import os
import re

src_dir = r"c:\Users\ohlamon\Desktop\vkplayer\123\frontend\src"

pattern = re.compile(r'letter-spacing:\s*([^;]+);')

for root, _, files in os.walk(src_dir):
    for f in files:
        if f.endswith('.vue') or f.endswith('.css'):
            path = os.path.join(root, f)
            with open(path, 'r', encoding='utf-8') as file:
                content = file.read()
            
            # Don't replace if it already has var(--letter-spacing)
            def replacer(match):
                val = match.group(1).strip()
                if 'var(--letter-spacing' in val:
                    return match.group(0)
                return f'letter-spacing: calc({val} + var(--letter-spacing, 0px));'
                
            new_content = pattern.sub(replacer, content)
            
            if new_content != content:
                with open(path, 'w', encoding='utf-8') as file:
                    file.write(new_content)
                print(f"Updated {path}")
