import re

with open('backend/app/services/ai_tokens.py', 'r') as f:
    content = f.read()

# Add to function signature
old_sig = """    price_usd: Optional[float] = None,
    is_active: Optional[bool] = None,"""
new_sig = """    price_usd: Optional[float] = None,
    is_active: Optional[bool] = None,
    polar_product_id: Optional[str] = None,"""
content = content.replace(old_sig, new_sig)

# Add to params
anchor = """    if is_active is not None:
        fields.append("is_active = :is_active")
        params["is_active"] = 1 if is_active else 0"""

insertion = """
    if polar_product_id is not None:
        fields.append("polar_product_id = :polar_product_id")
        params["polar_product_id"] = str(polar_product_id).strip()"""
content = content.replace(anchor, anchor + insertion)

with open('backend/app/services/ai_tokens.py', 'w') as f:
    f.write(content)
