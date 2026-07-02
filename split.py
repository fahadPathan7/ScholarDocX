import os

with open('frontend/src/components/AdminView.tsx', 'r') as f:
    lines = f.readlines()

def get_lines(start, end):
    # start and end are 1-indexed
    return "".join(lines[start-1:end])

# LimitsTab: 417 to 1017
# InvitesTab: 1018 to 1271
# InviteRequestsTab: 1393 to 1535
# SettingsTab: 1536 to 2050

limits_body = get_lines(417, 1017).replace('function LimitsTab', 'export function RoleLimitsTab')
invites_body = get_lines(1018, 1271).replace('function InvitesTab', 'export function InvitesTab')
requests_body = get_lines(1393, 1535).replace('function InviteRequestsTab', 'export function InviteRequestsTab')
settings_body = get_lines(1536, 2050).replace('function SettingsTab', 'export function SettingsTab')

imports_header = """import React, { useState, useEffect } from "react";
import { api } from "../../lib/api";
import { hasRole } from "../../lib/auth";
import { emitUiError } from "../../lib/uiError";
import { useDialog } from "../DialogProvider";
import { Modal } from "../Modal";
import { 
  CheckCircle, XCircle, Info, Copy, Settings,
  ShieldAlert, Clock, Trash2, Check, X, Shield, Activity
} from "lucide-react";
"""

def format_file(body):
    return imports_header + "\n" + body

with open('frontend/src/components/admin/RoleLimitsTab.tsx', 'w') as f:
    # also add formatTokenCount
    f.write(imports_header + "\nfunction formatTokenCount(n: number) {\n  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';\n  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';\n  return n.toString();\n}\n\n" + limits_body)

with open('frontend/src/components/admin/InvitesTab.tsx', 'w') as f:
    f.write(format_file(invites_body))

with open('frontend/src/components/admin/InviteRequestsTab.tsx', 'w') as f:
    f.write(format_file(requests_body))

with open('frontend/src/components/admin/SettingsTab.tsx', 'w') as f:
    f.write(format_file(settings_body))

# Reconstruct AdminView.tsx
new_admin_view = []
for i, line in enumerate(lines):
    l = i + 1
    # Skip the extracted blocks
    if (417 <= l <= 1017) or (1018 <= l <= 1271) or (1393 <= l <= 1535) or (1536 <= l <= 2050):
        continue
    new_admin_view.append(line)

new_content = "".join(new_admin_view)

# Add imports for the new tabs right after ModelPricingTab import
import_insert = """import { RoleLimitsTab } from "./admin/RoleLimitsTab";
import { InvitesTab } from "./admin/InvitesTab";
import { InviteRequestsTab } from "./admin/InviteRequestsTab";
import { SettingsTab } from "./admin/SettingsTab";
"""
new_content = new_content.replace('import { ModelPricingTab } from "./admin/ModelPricingTab";', import_insert + 'import { ModelPricingTab } from "./admin/ModelPricingTab";')

# Replace <LimitsTab /> with <RoleLimitsTab /> in AdminView.tsx
new_content = new_content.replace('<LimitsTab ', '<RoleLimitsTab ')

with open('frontend/src/components/AdminView.tsx', 'w') as f:
    f.write(new_content)

print("Split complete.")
