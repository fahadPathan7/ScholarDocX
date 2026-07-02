import React, { useState } from "react";
import { X, Calendar } from "lucide-react";
import type { DateColorConfig } from "./sheetModel";

export function DateColorConfigModal({
  config,
  onSave,
  onClose
}: {
  config: DateColorConfig;
  onSave: (config: DateColorConfig) => void;
  onClose: () => void;
}) {
  const [redDays, setRedDays] = useState(config.redDays);
  const [yellowDays, setYellowDays] = useState(config.yellowDays);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ redDays, yellowDays });
  };

  return (
    <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal-panel small-modal-panel" onClick={(e) => e.stopPropagation()} style={{ width: '440px' }}>
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '16px', borderBottom: '1px solid var(--ui-line)', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} />
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Date Colors</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Configure how dates in your sheet are highlighted based on how close they are to today.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            {/* Red Setting */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid var(--ui-line)', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--danger)', flexShrink: 0 }}></div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Urgent</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Red Indicator</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Less than</span>
                <input 
                  type="number" 
                  min="0" 
                  value={redDays} 
                  onChange={(e) => setRedDays(parseInt(e.target.value) || 0)} 
                  style={{ width: '64px', textAlign: 'center', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '14px' }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>days</span>
              </div>
            </div>
            
            {/* Yellow Setting */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', border: '1px solid var(--ui-line)', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: 'var(--warning)', flexShrink: 0 }}></div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>Upcoming</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Yellow Indicator</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Less than</span>
                <input 
                  type="number" 
                  min="0" 
                  value={yellowDays} 
                  onChange={(e) => setYellowDays(parseInt(e.target.value) || 0)} 
                  style={{ width: '64px', textAlign: 'center', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '14px' }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>days</span>
              </div>
            </div>

            <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--text-secondary)', padding: '12px', backgroundColor: 'var(--ui-paper)', border: '1px solid var(--ui-line)', borderRadius: '6px', lineHeight: '1.5' }}>
              <strong style={{ color: 'var(--text-primary)' }}>Note:</strong> Dates further away than {yellowDays} days will show a green indicator. Past dates will appear gray.
            </div>
          </div>
          
          <div className="modal-footer" style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid var(--ui-line)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">Save Configuration</button>
          </div>
        </form>
      </div>
    </div>
  );
}
