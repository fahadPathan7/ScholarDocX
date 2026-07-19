with open('frontend/src/components/admin/PlanPricingTable.tsx', 'r') as f:
    content = f.read()

content = content.replace("10,000 tokens = $1.00", "10,000 credits = $1.00")
content = content.replace("Set pack prices higher", "Set plan prices higher")

with open('frontend/src/components/admin/PlanPricingTable.tsx', 'w') as f:
    f.write(content)
