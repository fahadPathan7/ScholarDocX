import re

with open('frontend/src/components/AdminView.tsx', 'r') as f:
    content = f.read()

def extract_function(name):
    # Find the start of the function
    start_match = re.search(r'^((?:export )?function ' + name + r'\b.*?{)', content, re.MULTILINE | re.DOTALL)
    if not start_match:
        print(f"Could not find {name}")
        return None, None
    
    start_idx = start_match.start()
    
    # We need to find the matching closing brace.
    brace_count = 0
    in_string = False
    string_char = ''
    in_comment = False
    
    i = start_idx
    while i < len(content):
        c = content[i]
        if in_comment:
            if c == '\n':
                in_comment = False
        elif in_string:
            if c == '\\':
                i += 1
            elif c == string_char:
                in_string = False
        else:
            if c == '/' and i + 1 < len(content) and content[i+1] == '/':
                in_comment = True
                i += 1
            elif c in ('"', "'", '`'):
                in_string = True
                string_char = c
            elif c == '{':
                brace_count += 1
            elif c == '}':
                brace_count -= 1
                if brace_count == 0:
                    # Found the end
                    return content[start_idx:i+1], (start_idx, i+1)
        i += 1
    return None, None

funcs_to_extract = ["LimitsTab", "SettingsTab", "InvitesTab", "InviteRequestsTab"]
extracted = {}

for func in funcs_to_extract:
    func_text, span = extract_function(func)
    if func_text:
        extracted[func] = func_text
        content = content[:span[0]] + content[span[1]:]

# Add imports for the extracted components
new_imports = "import { RoleLimitsTab } from \"./admin/RoleLimitsTab\";\nimport { SettingsTab } from \"./admin/SettingsTab\";\nimport { InvitesTab } from \"./admin/InvitesTab\";\nimport { InviteRequestsTab } from \"./admin/InviteRequestsTab\";\n"

# Replace old AdminView content
content = content.replace('import { UsersTab } from "./admin/UsersTab";', new_imports + 'import { UsersTab } from "./admin/UsersTab";')
content = content.replace('<LimitsTab onLimitsUpdated={refreshTrigger ? () => {} : undefined} />', '<RoleLimitsTab onLimitsUpdated={refreshTrigger ? () => {} : undefined} />')

with open('frontend/src/components/AdminView.tsx', 'w') as f:
    f.write(content)

# We will let the agent generate the actual files so it can include correct imports.
import json
with open('extracted.json', 'w') as f:
    json.dump(extracted, f)

print("Extraction script complete.")
