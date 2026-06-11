import re

with open("backend/app/api/routes.py", "r") as f:
    content = f.read()

# Add import
content = content.replace(
    "from app.api.dependencies import get_store",
    "from app.api.dependencies import get_store\nfrom app.auth.dependencies import get_user_store"
)

# Replace depends
content = content.replace("store: Store = Depends(get_store)", "store: Store = Depends(get_user_store)")

with open("backend/app/api/routes.py", "w") as f:
    f.write(content)
print("Updated routes.py")
