with open('frontend/src/components/admin/TokenPacksTab.tsx', 'r') as f:
    content = f.read()

# Add to Pack type
anchor = """  price_usd: number;
  is_active: boolean;"""
new_anchor = """  price_usd: number;
  is_active: boolean;
  polar_product_id?: string;"""
content = content.replace(anchor, new_anchor)

# Add to Draft type
draft_anchor = """  price_usd: string;
  is_active: boolean;"""
new_draft_anchor = """  price_usd: string;
  is_active: boolean;
  polar_product_id: string;"""
content = content.replace(draft_anchor, new_draft_anchor)

# Add to toDraft
to_draft_anchor = """    price_usd: p.price_usd.toFixed(2),
    is_active: p.is_active,"""
new_to_draft_anchor = """    price_usd: p.price_usd.toFixed(2),
    is_active: p.is_active,
    polar_product_id: p.polar_product_id || "","""
content = content.replace(to_draft_anchor, new_to_draft_anchor)

# Add to isSame
is_same_anchor = """    p.price_usd.toFixed(2) === Number(d.price_usd).toFixed(2) &&
    p.is_active === d.is_active"""
new_is_same_anchor = """    p.price_usd.toFixed(2) === Number(d.price_usd).toFixed(2) &&
    p.is_active === d.is_active &&
    (p.polar_product_id || "") === d.polar_product_id.trim()"""
content = content.replace(is_same_anchor, new_is_same_anchor)

# Add to handleSave payload
handle_save_anchor = """      const payload = {
        display_name: draft.display_name.trim(),
        token_amount: tokenAmount,
        price_usd: priceUsd,
        is_active: draft.is_active,
      };"""
new_handle_save_anchor = """      const payload = {
        display_name: draft.display_name.trim(),
        token_amount: tokenAmount,
        price_usd: priceUsd,
        is_active: draft.is_active,
        polar_product_id: draft.polar_product_id.trim() || null,
      };"""
content = content.replace(handle_save_anchor, new_handle_save_anchor)

# Update UI table header
th_anchor = """                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Price (USD)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Active</th>"""
new_th_anchor = """                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Price (USD)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Polar Product ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Active</th>"""
content = content.replace(th_anchor, new_th_anchor)

# Update UI table cell
td_anchor = """                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-md text-sm"
                      value={draft.price_usd}
                      onChange={(e) => updateDraft(pack.code, { price_usd: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3">"""
new_td_anchor = """                  <td className="px-4 py-3">
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-md text-sm"
                      value={draft.price_usd}
                      onChange={(e) => updateDraft(pack.code, { price_usd: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      placeholder="Polar Product ID"
                      className="w-36 px-2 py-1.5 bg-white border border-slate-200 rounded-md text-sm"
                      value={draft.polar_product_id}
                      onChange={(e) => updateDraft(pack.code, { polar_product_id: e.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3">"""
content = content.replace(td_anchor, new_td_anchor)

with open('frontend/src/components/admin/TokenPacksTab.tsx', 'w') as f:
    f.write(content)
