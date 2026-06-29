import os

def main():
    base_dirs = ['.']
    exts = {'.py', '.ts', '.vue', '.css', '.md', '.json', '.html'}
    ignore_dirs = {
        'node_modules', 'venv', '.git', 'dist', 'build', 
        '__pycache__', '.idea', '.vscode', '.github'
    }
    
    files_data = []
    total_lines = 0
    total_files = 0
    
    for d in base_dirs:
        for root, dirs, files in os.walk(d):
            # Exclude ignored directories from os.walk
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            for f in files:
                if any(f.endswith(e) for e in exts):
                    path = os.path.join(root, f)
                    rel_path = os.path.relpath(path, start='.')
                    
                    try:
                        with open(path, 'r', encoding='utf-8') as fh:
                            content = fh.read()
                            lines = len(content.split('\n'))
                            total_lines += lines
                            total_files += 1
                            
                            separator = "=" * 80
                            header = f"FILE: {rel_path} | LINES: {lines}"
                            files_data.append(f"{separator}\n{header}\n{separator}\n{content}\n")
                    except Exception:
                        pass
                        
    output_file = 'all_code.txt'
    with open(output_file, 'w', encoding='utf-8') as out:
        out.write(f"PROJECT DUMP\nTotal files: {total_files}\nTotal lines: {total_lines}\n\n")
        out.write("\n".join(files_data))
        
    print(f"Done. Wrote {total_files} files ({total_lines} lines) to {output_file}")

if __name__ == '__main__':
    main()
