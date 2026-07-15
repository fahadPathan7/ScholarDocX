import os
import glob

def fix_imports(filepath):
    with open(filepath, 'r') as f:
        lines = f.read().split('\n')
        
    idx_compat = -1
    idx_future = -1
    for i, line in enumerate(lines):
        if line.startswith("from app.core.compat import"):
            idx_compat = i
        elif line.startswith("from __future__ import"):
            idx_future = i
            
    if idx_compat != -1 and idx_future != -1 and idx_compat < idx_future:
        # Swap them
        lines.insert(idx_future + 1, lines.pop(idx_compat))
        with open(filepath, 'w') as f:
            f.write('\n'.join(lines))
        print(f"Fixed {filepath}")

for root, dirs, files in os.walk('backend/app'):
    for file in files:
        if file.endswith('.py'):
            fix_imports(os.path.join(root, file))
