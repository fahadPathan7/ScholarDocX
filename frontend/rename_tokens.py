import os

# Update TokenPacksTab.tsx
with open('frontend/src/components/admin/TokenPacksTab.tsx', 'r') as f:
    content = f.read()
    
content = content.replace("10,000 tokens = $1.00", "10,000 credits = $1.00")

with open('frontend/src/components/admin/TokenPacksTab.tsx', 'w') as f:
    f.write(content)

# Update SettingsTab.tsx
with open('frontend/src/components/admin/SettingsTab.tsx', 'r') as f:
    content = f.read()

content = content.replace("Set per-1M token input/output prices", "Set per-1M credit input/output prices")
content = content.replace("user's AI token balance (converted via token rate)", "user's AI credit balance (converted via credit rate)")
content = content.replace("Extra Credit Token Packs", "Extra Credit Packs")

with open('frontend/src/components/admin/SettingsTab.tsx', 'w') as f:
    f.write(content)
