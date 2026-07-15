import os
import re

APP_DIR = "backend/app"

# Manual patches dictionary, keyed by relative file path
MANUAL_PATCHES = {
    "services/ai_tokens.py": [
        (r'roles = json\.loads\(row\["roles"\]\) if row\["roles"\] else \[\]', r'roles = safe_json_loads(row["roles"], default=[])'),
        (r'start_dt = datetime\.fromisoformat\(plan_started_at_str\.replace\("Z", "\+00:00"\)\.split\("\+"\)\[0\]\)', r'start_dt = safe_parse_datetime(plan_started_at_str)'),
    ],
    "services/admin.py": [
        (r'd\["roles"\] = json\.loads\(d\["roles"\]\) if d\["roles"\] else \[\]', r'd["roles"] = safe_json_loads(d["roles"], default=[])'),
        (r'd\["details"\] = json\.loads\(d\["details"\]\) if d\["details"\] else None', r'd["details"] = safe_json_loads(d["details"], default=None)'),
        (r'return datetime\.fromisoformat\(value\.replace\("Z", "\+00:00"\)\.split\("\+"\)\[0\]\)', r'return safe_parse_datetime(value)'),
    ],
    "services/ai_actions_read.py": [
        (r'return datetime\.fromisoformat\(cleaned\.replace\("Z", "\+00:00"\)\)\.date\(\)', r'parsed_dt = safe_parse_datetime(cleaned)\n        return parsed_dt.date() if parsed_dt else None'),
        (r'return date\.fromisoformat\(cleaned\)', r'return safe_parse_date(cleaned)'),
        (r'if 0 <= \(date\.fromisoformat\(e\["parsed_date"\]\) - today\)\.days <= days_ahead:', 
         r'pd = safe_parse_date(e["parsed_date"])\n                    if pd and 0 <= (pd - today).days <= days_ahead:'),
    ],
    "services/store.py": [
        (r'return datetime\.fromisoformat\(value\.replace\("Z", "\+00:00"\)\)\.date\(\)', r'dt = safe_parse_datetime(value)\n        return dt.date() if dt else None'),
        (r'return date\.fromisoformat\(value\)', r'return safe_parse_date(value)'),
        (r'columns = json\.loads\(data\.get\("columns_json"\) or "\[\]"\)', r'columns = safe_json_loads(data.get("columns_json"), default=[])'),
        (r'data\["rows"\] = json\.loads\(data\.get\("rows_json"\) or "\[\]"\)', r'data["rows"] = safe_json_loads(data.get("rows_json"), default=[])'),
        (r'data\["email_config"\] = json\.loads\(data\.get\("email_config_json"\) or "null"\)', r'data["email_config"] = safe_json_loads(data.get("email_config_json"), default=None)'),
    ],
    "api/auth.py": [
        (r'if invite\["expires_at"\] and datetime\.fromisoformat\(invite\["expires_at"\]\) < datetime\.utcnow\(\):',
         r'expires_dt = safe_parse_datetime(invite["expires_at"])\n    if expires_dt and expires_dt < datetime.utcnow():'),
        (r'roles = json\.loads\(user\["roles"\]\)', r'roles = safe_json_loads(user["roles"], default=[])')
    ],
    "auth/limits.py": [
        (r'last_reset_utc_naive = datetime\.fromisoformat\(last_reset_str\)', r'last_reset_utc_naive = safe_parse_datetime(last_reset_str)'),
        (r'start_dt = datetime\.fromisoformat\(plan_started_at\.replace\("Z", "\+00:00"\)\.split\("\+"\)\[0\]\)', r'start_dt = safe_parse_datetime(plan_started_at)'),
    ],
    "services/news_query_generator.py": [
        (r'parsed = json\.loads\(content\)', r'parsed = safe_json_loads(content, default={})')
    ],
    "core/notifications.py": [
        (r'raw = json\.loads\(raw\)', r'raw = safe_json_loads(raw, default={})')
    ],
    "services/ai_actions.py": [
        (r'parsed = json\.loads\(raw_answer\[start_idx:end_idx \+ 1\]\)', r'parsed = safe_json_loads(raw_answer[start_idx:end_idx + 1], default={})')
    ],
    "services/ai.py": [
        (r'decision = json\.loads\(raw_answer\[start_idx:end_idx \+ 1\]\)', r'decision = safe_json_loads(raw_answer[start_idx:end_idx + 1], default={})')
    ],
    "services/ai_actions_execute.py": [
        (r'columns = page\.get\("columns"\) or json\.loads\(page\.get\("columns_json"\) or "\[\]"\)', r'columns = page.get("columns") or safe_json_loads(page.get("columns_json"), default=[])'),
        (r'rows = page\.get\("rows"\) or json\.loads\(page\.get\("rows_json"\) or "\[\]"\)', r'rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])'),
        (r'old_rows = page\.get\("rows"\) or json\.loads\(page\.get\("rows_json"\) or "\[\]"\)', r'old_rows = page.get("rows") or safe_json_loads(page.get("rows_json"), default=[])'),
    ],
    "services/advisor_atlas/repository.py": [
        (r'item\[field\.removesuffix\("_json"\)\] = json\.loads\(item\[field\]\)', r'item[field.removesuffix("_json")] = safe_json_loads(item[field], default=[])')
    ],
    "services/advisor_atlas/analysis.py": [
        (r'value = json\.loads\(text\[start : end \+ 1\]\)', r'value = safe_json_loads(text[start : end + 1], default={})')
    ],
    "services/scholarship_deep_hunt.py": [
        (r'item\[field\.removesuffix\("_json"\)\] = json\.loads\(item\[field\]\)', r'item[field.removesuffix("_json")] = safe_json_loads(item[field], default=[])')
    ],
    "api/scholarship_opportunities.py": [
        (r'result\[key\[: -len\("_json"\)\]\] = json\.loads\(raw\) if raw else default', r'result[key[: -len("_json")]] = safe_json_loads(raw, default=default)')
    ],
    "api/routes.py": [
        (r'old_rows = json\.loads\(old_record\["rows_json"\] or "\[\]"\)', r'old_rows = safe_json_loads(old_record["rows_json"], default=[])'),
        (r'new_rows = json\.loads\(new_rows\)', r'new_rows = safe_json_loads(new_rows, default=[])'),
        (r'context_list = json\.loads\(payload\.context\) if payload\.context else \[\]', r'context_list = safe_json_loads(payload.context, default=[])')
    ]
}

def process_file(rel_path, patches):
    full_path = os.path.join(APP_DIR, rel_path)
    if not os.path.exists(full_path):
        return
        
    with open(full_path, 'r') as f:
        content = f.read()
        
    original = content
    
    for pattern, repl in patches:
        content = re.sub(pattern, repl, content)
        
    if content != original:
        import_stmt = "from app.core.compat import safe_parse_datetime, safe_parse_date, safe_json_loads"
        if import_stmt not in content:
            lines = content.split("\n")
            insert_idx = 0
            for i, line in enumerate(lines):
                if line.startswith("import ") or line.startswith("from "):
                    insert_idx = i
                    break
            
            lines.insert(insert_idx, import_stmt)
            content = "\n".join(lines)
            
        with open(full_path, 'w') as f:
            f.write(content)
        print(f"Patched {rel_path}")
        
for rel_path, patches in MANUAL_PATCHES.items():
    process_file(rel_path, patches)
