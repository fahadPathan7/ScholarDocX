import re

with open('backend/app/services/ai_tokens.py', 'r') as f:
    content = f.read()

# Update _PACK_SELECT
content = content.replace(
    '"SELECT id, code, display_name, token_amount, price_usd, is_active, sort_order "',
    '"SELECT id, code, display_name, token_amount, price_usd, is_active, sort_order, polar_product_id "'
)

# Update _pack_row
pack_row_anchor = '        "token_amount": int(row["token_amount"]),'
if 'polar_product_id' not in pack_row_anchor:
    content = content.replace(
        pack_row_anchor,
        pack_row_anchor + '\n        "polar_product_id": row["polar_product_id"],'
    )

with open('backend/app/services/ai_tokens.py', 'w') as f:
    f.write(content)
