with open('frontend/src/components/admin/SettingsTab.tsx', 'r') as f:
    content = f.read()

anchor = """        {/* External APIs Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-orange-100/50 p-2 rounded-lg border border-orange-200 flex items-center justify-center w-9 h-9 shrink-0">
              <Globe className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">External APIs</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure pricing for external tools like Tavily.</p>
            </div>
          </div>
          <div className="px-3 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
            <button onClick={() => setShowExternalApisModal(true)} className="admin-config-btn">
              Configure <ChevronRight size={13} />
            </button>
          </div>
        </div>"""

insertion = """
        {/* Polar.sh Integration Card */}
        <div className="profile-system-card glass-panel overflow-hidden flex flex-col justify-between" style={{ padding: '0' }}>
          <div className="p-4 flex items-center gap-3">
            <div className="bg-sky-100/50 p-2 rounded-lg border border-sky-200 flex items-center justify-center w-9 h-9 shrink-0">
              <Globe className="w-5 h-5 text-sky-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900 text-sm">Polar.sh Integration</h3>
              <p className="text-xs text-slate-500 mt-0.5">Configure Polar.sh subscription product IDs.</p>
            </div>
          </div>
          <div className="px-3 py-2.5 border-t border-slate-200/50 bg-slate-50/50 flex justify-end">
            <button onClick={() => setShowPolarModal(true)} className="admin-config-btn">
              Configure <ChevronRight size={13} />
            </button>
          </div>
        </div>"""

if "Polar.sh Integration" not in anchor: # It's not there, so we inject
    if 'Polar.sh Integration Card' not in content:
        content = content.replace(anchor, anchor + "\n" + insertion)
        with open('frontend/src/components/admin/SettingsTab.tsx', 'w') as f:
            f.write(content)
