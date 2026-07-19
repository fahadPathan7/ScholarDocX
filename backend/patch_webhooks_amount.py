import re

with open('backend/app/api/webhooks.py', 'r') as f:
    content = f.read()

anchor = """async def handle_order_created(data: Dict[str, Any], store: Store):
    product_id = data.get("product_id")
    amount = None
    for i in range(1, 5):
        if product_id == get_app_setting(store, f"polar_extra_credits_id_{i}"):
            try:
                amount = int(get_app_setting(store, f"polar_extra_credits_amount_{i}", "0"))
            except ValueError:
                amount = 0
            break
            
    if amount and amount > 0:
        if user:
            user_dict = {
                "id": user.id,
                "email": user.email,
                "name": user.name
            }
            pack = {
                "name": f"Polar Extra Credits ({amount})",
                "tokens": amount
            }
            await ai_tokens.grant_tokens(store.db, user_dict, pack, "polar_order")
            logger.info(f"Granted {amount} tokens to user {user.id} from polar order")"""

new_code = """async def handle_order_created(data: Dict[str, Any], store: Store):
    product_id = data.get("product_id")
    
    pack_code = None
    if product_id == get_app_setting(store, "polar_extra_credits_id_1"):
        pack_code = "small"
    elif product_id == get_app_setting(store, "polar_extra_credits_id_2"):
        pack_code = "medium"
    elif product_id == get_app_setting(store, "polar_extra_credits_id_3"):
        pack_code = "large"
    elif product_id == get_app_setting(store, "polar_extra_credits_id_4"):
        pack_code = "extra_large"

    if pack_code:
        # Fetch the token pack from the database dynamically
        pack_row = store.db.scalar(select(AiTokenPacks).where(AiTokenPacks.code == pack_code))
        if pack_row and pack_row.token_amount > 0 and user:
            user_dict = {
                "id": user.id,
                "email": user.email,
                "name": user.name
            }
            pack_info = {
                "name": pack_row.display_name,
                "tokens": pack_row.token_amount
            }
            await ai_tokens.grant_tokens(store.db, user_dict, pack_info, "polar_order")
            logger.info(f"Granted {pack_row.token_amount} tokens (Pack: {pack_row.display_name}) to user {user.id} from polar order")"""

if "amount = None" in content:
    content = content.replace(anchor, new_code)
    with open('backend/app/api/webhooks.py', 'w') as f:
        f.write(content)
