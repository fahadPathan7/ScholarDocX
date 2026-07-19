import re

with open('backend/app/api/ai_tokens.py', 'r') as f:
    content = f.read()

anchor = """class PackUpdatePayload(BaseModel):
    display_name: Optional[str] = None
    token_amount: Optional[int] = None
    price_usd: Optional[float] = None
    is_active: Optional[bool] = None"""

new_anchor = """class PackUpdatePayload(BaseModel):
    display_name: Optional[str] = None
    token_amount: Optional[int] = None
    price_usd: Optional[float] = None
    is_active: Optional[bool] = None
    polar_product_id: Optional[str] = None"""

content = content.replace(anchor, new_anchor)

handler_anchor = """        token_amount=payload.token_amount,
        price_usd=payload.price_usd,
        is_active=payload.is_active,
    )"""

new_handler_anchor = """        token_amount=payload.token_amount,
        price_usd=payload.price_usd,
        is_active=payload.is_active,
        polar_product_id=payload.polar_product_id,
    )"""
content = content.replace(handler_anchor, new_handler_anchor)

with open('backend/app/api/ai_tokens.py', 'w') as f:
    f.write(content)
