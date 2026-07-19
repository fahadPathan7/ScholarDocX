with open('frontend/src/components/admin/TokenPacksTab.tsx', 'r') as f:
    content = f.read()

# Revert TokenPacksTab.tsx
content = content.replace('<th className="px-3 py-3 w-[18%]">Polar Product ID</th>\n                ', '')
content = content.replace('''                      <td className="px-3 py-3 min-w-0">
                        <input
                          type="text"
                          placeholder="Polar Product ID"
                          value={draft.polar_product_id}
                          onChange={(e) => updateDraft(pack.code, { polar_product_id: e.target.value })}
                          className="w-full min-w-0 px-2 py-1.5 bg-white border border-slate-200/60 rounded-lg text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                        />
                      </td>\n''', '')

with open('frontend/src/components/admin/TokenPacksTab.tsx', 'w') as f:
    f.write(content)
