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
    <div className="date-colors-backdrop" onClick={onClose}>
      <div className="date-colors-panel" onClick={(e) => e.stopPropagation()}>
        <div className="date-colors-header">
          <div className="date-colors-title-group">
            <Calendar size={18} />
            <h2>Date Colors</h2>
          </div>
          <button type="button" className="date-colors-close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="date-colors-content">
          <p className="date-colors-desc">
            Configure how dates in your sheet are highlighted based on how close they are to today.
          </p>
          
          <div className="date-colors-list">
            
            {/* Red Setting */}
            <div className="date-colors-card">
              <div className="date-colors-card-left">
                <div className="date-colors-dot date-colors-dot--urgent"></div>
                <div className="date-colors-card-label">
                  <span className="date-colors-card-title">Urgent</span>
                  <span className="date-colors-card-subtitle">Red Indicator</span>
                </div>
              </div>
              
              <div className="date-colors-card-right">
                <span className="date-colors-card-text">Less than</span>
                <input 
                  type="number" 
                  min="0" 
                  value={redDays} 
                  onChange={(e) => setRedDays(parseInt(e.target.value) || 0)} 
                  className="date-colors-input"
                />
                <span className="date-colors-card-text">days</span>
              </div>
            </div>
            
            {/* Yellow Setting */}
            <div className="date-colors-card">
              <div className="date-colors-card-left">
                <div className="date-colors-dot date-colors-dot--upcoming"></div>
                <div className="date-colors-card-label">
                  <span className="date-colors-card-title">Upcoming</span>
                  <span className="date-colors-card-subtitle">Yellow Indicator</span>
                </div>
              </div>
              
              <div className="date-colors-card-right">
                <span className="date-colors-card-text">Less than</span>
                <input 
                  type="number" 
                  min="0" 
                  value={yellowDays} 
                  onChange={(e) => setYellowDays(parseInt(e.target.value) || 0)} 
                  className="date-colors-input"
                />
                <span className="date-colors-card-text">days</span>
              </div>
            </div>

            <div className="date-colors-note">
              <strong>Note:</strong> Dates further away than {yellowDays} days will show a green indicator. Past dates will appear gray.
            </div>
          </div>
          
          <div className="date-colors-footer">
            <button type="button" className="date-colors-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="date-colors-btn-primary">Save Configuration</button>
          </div>
        </form>
      </div>
    </div>
  );
}
