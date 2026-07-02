import re

# 1. Extract AdminPortal to its own file
with open('frontend/src/components/AdminView.tsx', 'r') as f:
    admin_view_content = f.read()

portal_start = admin_view_content.find("function AdminPortal")
portal_end = admin_view_content.find("function SectionHeader", portal_start)
admin_portal_code = admin_view_content[portal_start:portal_end]
admin_view_content = admin_view_content[:portal_start] + admin_view_content[portal_end:]

admin_portal_file_content = """import React from "react";
""" + admin_portal_code.replace("function AdminPortal", "export function AdminPortal")

with open('frontend/src/components/admin/AdminPortal.tsx', 'w') as f:
    f.write(admin_portal_file_content)

# Update AdminView to import AdminPortal
admin_view_content = admin_view_content.replace('import { UsersTab } from "./admin/UsersTab";', 'import { AdminPortal } from "./admin/AdminPortal";\nimport { UsersTab } from "./admin/UsersTab";')
with open('frontend/src/components/AdminView.tsx', 'w') as f:
    f.write(admin_view_content)


def add_imports(filepath, new_imports):
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Replace useMemo
    content = content.replace('import React, { useState, useEffect }', 'import React, { useState, useEffect, useMemo }')
    
    # Add AdminPortal
    if "AdminPortal" in content:
        content = 'import { AdminPortal } from "./AdminPortal";\n' + content
        
    # Add new lucide imports
    lucide_match = re.search(r'import \{[^}]+\} from "lucide-react";', content)
    if lucide_match:
        old_lucide = lucide_match.group(0)
        new_lucide = old_lucide.replace('} from "lucide-react";', ', ' + ", ".join(new_imports) + '} from "lucide-react";')
        content = content.replace(old_lucide, new_lucide)
        
    with open(filepath, 'w') as f:
        f.write(content)

# InviteRequestsTab
add_imports('frontend/src/components/admin/InviteRequestsTab.tsx', ['Users', 'Search'])
# Fix implicit any
with open('frontend/src/components/admin/InviteRequestsTab.tsx', 'r') as f:
    c = f.read()
c = c.replace('(r => r.status', '((r: any) => r.status')
with open('frontend/src/components/admin/InviteRequestsTab.tsx', 'w') as f:
    f.write(c)

# InvitesTab
add_imports('frontend/src/components/admin/InvitesTab.tsx', ['KeyRound', 'Search', 'Eye'])
with open('frontend/src/components/admin/InvitesTab.tsx', 'r') as f:
    c = f.read()
c = c.replace('.filter(inv =>', '.filter((inv: any) =>')
with open('frontend/src/components/admin/InvitesTab.tsx', 'w') as f:
    f.write(c)
    
# RoleLimitsTab
add_imports('frontend/src/components/admin/RoleLimitsTab.tsx', [])

# SettingsTab
add_imports('frontend/src/components/admin/SettingsTab.tsx', ['ChevronRight', 'CircleDollarSign', 'Package', 'Globe', 'EyeOff', 'Eye'])
with open('frontend/src/components/admin/SettingsTab.tsx', 'r') as f:
    c = f.read()
c = 'import { ModelPricingTab } from "./ModelPricingTab";\nimport { TokenPacksTab } from "./TokenPacksTab";\n' + c
with open('frontend/src/components/admin/SettingsTab.tsx', 'w') as f:
    f.write(c)

print("Imports fixed.")
