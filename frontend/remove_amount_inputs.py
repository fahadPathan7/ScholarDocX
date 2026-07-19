with open('frontend/src/components/admin/SettingsTab.tsx', 'r') as f:
    content = f.read()

anchor = """              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-4 items-end">
                    <div className="space-y-1.5 flex-[2]">
                      <label className="block text-sm font-medium text-slate-700">Token Pack {i} Product ID</label>
                      <input
                        type="text"
                        defaultValue={settings[`polar_extra_credits_id_${i}`] || ""}
                        id={`modal-input-polar_extra_credits_id_${i}`}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <label className="block text-sm font-medium text-slate-700">Token Amount</label>
                      <input
                        type="number"
                        min="0"
                        defaultValue={settings[`polar_extra_credits_amount_${i}`] || ""}
                        id={`modal-input-polar_extra_credits_amount_${i}`}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                    </div>
                    <button onClick={() => {
                      const idEl = document.getElementById(`modal-input-polar_extra_credits_id_${i}`) as HTMLInputElement;
                      const amountEl = document.getElementById(`modal-input-polar_extra_credits_amount_${i}`) as HTMLInputElement;
                      if (idEl) handleUpdate(`polar_extra_credits_id_${i}`, idEl.value);
                      if (amountEl) handleUpdate(`polar_extra_credits_amount_${i}`, amountEl.value);
                    }} className="profile-primary-button px-4 py-2 h-[38px]">
                      Save
                    </button>
                  </div>
                ))}
              </div>"""

new_anchor = """              <div className="grid grid-cols-2 gap-4">
                {[
                  { id: 1, name: "Small Pack" },
                  { id: 2, name: "Medium Pack" },
                  { id: 3, name: "Large Pack" },
                  { id: 4, name: "Extra Large Pack" }
                ].map((pack) => (
                  <div key={pack.id} className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">{pack.name} Product ID</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        defaultValue={settings[`polar_extra_credits_id_${pack.id}`] || ""}
                        id={`modal-input-polar_extra_credits_id_${pack.id}`}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                      <button onClick={() => {
                        const idEl = document.getElementById(`modal-input-polar_extra_credits_id_${pack.id}`) as HTMLInputElement;
                        if (idEl) handleUpdate(`polar_extra_credits_id_${pack.id}`, idEl.value);
                      }} className="profile-primary-button px-4 py-2">
                        Save
                      </button>
                    </div>
                  </div>
                ))}
              </div>"""

content = content.replace(anchor, new_anchor)

with open('frontend/src/components/admin/SettingsTab.tsx', 'w') as f:
    f.write(content)
