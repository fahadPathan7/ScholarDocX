import re

store_path = "backend/app/services/store.py"
with open(store_path, "r") as f:
    content = f.read()

# Find the TABLE_COLUMNS dictionary
match = re.search(r"TABLE_COLUMNS = \{(.*?)\n\}", content, flags=re.DOTALL)
if match:
    dict_content = match.group(1)
    # For every line that has ` "table_name": { ... },` we add `"user_id", ` inside the set.
    def add_user_id(m):
        prefix = m.group(1)
        items = m.group(2)
        # check if it's already there
        if '"user_id"' in items:
            return m.group(0)
        # if it's a multi-line set definition, let's just do a simple replacement for all lines:
        return f'{prefix}{{"user_id", {items}}}'
        
    # single line sets: "projects": {"name", ...}
    new_dict_content = re.sub(r'(\s*"\w+":\s*)\{(.*?)\}', add_user_id, dict_content)
    
    new_content = content.replace(dict_content, new_dict_content)
    with open(store_path, "w") as f:
        f.write(new_content)
    print("Updated TABLE_COLUMNS in store.py")
else:
    print("Could not find TABLE_COLUMNS")
