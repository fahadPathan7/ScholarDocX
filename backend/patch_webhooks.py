import re

with open('backend/app/api/webhooks.py', 'r') as f:
    content = f.read()

# Make sure AiTokenPacks is imported
if 'AiTokenPacks' not in content:
    content = content.replace(
        'from app.db.models import Users',
        'from app.db.models import Users, AiTokenPacks'
    )

old_logic = """async def handle_order_created(data: Dict[str, Any], store: Store):
    product_id = data.get("product_id")
    amount = None
    for i in range(1, 5):
        if product_id == get_app_setting(store, f"polar_extra_credits_id_{i}"):
            try:
                amount = int(get_app_setting(store, f"polar_extra_credits_amount_{i}", "0"))
            except ValueError:
                amount = 0
            break
            
    if amount and amount > 0:"""

new_logic = """async def handle_order_created(data: Dict[str, Any], store: Store):
    product_id = data.get("product_id")
    
    # Query AiTokenPacks for the purchased pack
    pack = store.db.scalar(select(AiTokenPacks).where(AiTokenPacks.polar_product_id == product_id))
    
    if pack and pack.token_amount > 0:
        amount = pack.token_amount"""

content = content.replace(old_logic, new_logic)

pack_name_old = """            pack = {
                "name": f"Polar Extra Credits ({amount})",
                "tokens": amount
            }"""
pack_name_new = """            pack_info = {
                "name": pack.display_name,
                "tokens": amount
            }"""
content = content.replace(pack_name_old, pack_name_new)
content = content.replace('await ai_tokens.grant_tokens(store.db, user_dict, pack, "polar_order")', 'await ai_tokens.grant_tokens(store.db, user_dict, pack_info, "polar_order")')
content = content.replace('logger.info(f"Granted {amount} tokens to user {user.id} from polar order")', 'logger.info(f"Granted {amount} tokens (Pack: {pack.display_name}) to user {user.id} from polar order")')

with open('backend/app/api/webhooks.py', 'w') as f:
    f.write(content)
