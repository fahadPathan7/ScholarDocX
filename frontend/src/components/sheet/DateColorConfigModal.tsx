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
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ width: '400px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} />
            <h2>Date Colors</h2>
          </div>
          <button className="icon-button compact" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body" style={{ gap: '16px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Configure how dates in your sheet are highlighted based on how close they are to today.
          </p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label className="field">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--danger)' }}></span>
                Red Indicator (Urgent)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="number" 
                  min="0" 
                  value={redDays} 
                  onChange={(e) => setRedDays(parseInt(e.target.value) || 0)} 
                  style={{ width: '80px' }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>days or fewer</span>
              </div>
            </label>
            
            <label className="field">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--warning)' }}></span>
                Yellow Indicator (Upcoming)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input 
                  type="number" 
                  min="0" 
                  value={yellowDays} 
                  onChange={(e) => setYellowDays(parseInt(e.target.value) || 0)} 
                  style={{ width: '80px' }}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>days or fewer</span>
              </div>
            </label>

            <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)', padding: '8px', backgroundColor: 'var(--bg-secondary)', borderRadius: '6px' }}>
              Dates further away than {yellowDays} days will be shown with a green indicator. Past dates will appear gray.
            </div>
          </div>
          
          <div className="modal-footer" style={{ marginTop: '16px' }}>
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">Save Configuration</button>
          </div>
        </form>
      </div>
    </div>
  );
}
