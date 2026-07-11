import React, { useEffect, useState } from "react";
import { X, Target } from "lucide-react";
import { listRecords, RecordMap } from "../../lib/api";
import { HuntProfile, getHuntProfile, saveHuntProfile } from "../../lib/huntProfile";

const DEGREE_LEVELS = ["Bachelor's", "Master's", "PhD", "Postdoctoral", "Short Course"];

const PROJECT_DEGREE_TYPE_TO_LEVEL: Record<string, string> = {
  bachelors: "Bachelor's",
  masters: "Master's",
  phd: "PhD",
};

interface HuntProfileModalProps {
  onClose: () => void;
  onSaved: (profile: HuntProfile) => void;
  onToast: (msg: string) => void;
}

export function HuntProfileModal({ onClose, onSaved, onToast }: HuntProfileModalProps) {
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profile, setProfile] = useState<HuntProfile | null>(null);
  const [destinationsInput, setDestinationsInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { profileId: id, profile: loaded } = await getHuntProfile();
        let next = loaded;
        if (!loaded.degree_level) {
          const projects = await listRecords<RecordMap>("projects");
          const first = projects[0];
          if (first) {
            next = {
              ...loaded,
              degree_level: PROJECT_DEGREE_TYPE_TO_LEVEL[first.degree_type] || loaded.degree_level,
            };
          }
        }
        setProfileId(id);
        setProfile(next);
        setDestinationsInput(next.destinations.join(", "));
      } catch (error) {
        onToast("Failed to load your Hunt Profile.");
        onClose();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    if (!profile || profileId === null) return;
    setIsSaving(true);
    const toSave: HuntProfile = {
      ...profile,
      destinations: destinationsInput
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean),
    };
    try {
      await saveHuntProfile(profileId, toSave);
      onToast("Hunt Profile saved.");
      onSaved(toSave);
      onClose();
    } catch (error) {
      onToast("Failed to save Hunt Profile.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading || !profile) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
          <div className="modal-content">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Target size={24} color="#1f4f5a" /> Hunt Profile
          </h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-content">
          <div className="hunt-profile-grid">
            <label className="field">
              <span>Degree level</span>
              <select
                value={profile.degree_level}
                onChange={(e) => setProfile({ ...profile, degree_level: e.target.value })}
              >
                <option value="">Not set</option>
                {DEGREE_LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Intake term</span>
              <input
                type="text"
                value={profile.intake_term}
                onChange={(e) => setProfile({ ...profile, intake_term: e.target.value })}
                placeholder="Fall 2027"
              />
            </label>
            <label className="field full-width">
              <span>Target destinations (comma-separated)</span>
              <input
                type="text"
                value={destinationsInput}
                onChange={(e) => setDestinationsInput(e.target.value)}
                placeholder="Germany, Netherlands"
              />
            </label>
            <label className="field full-width">
              <span>Field of study</span>
              <input
                type="text"
                value={profile.field_of_study}
                onChange={(e) => setProfile({ ...profile, field_of_study: e.target.value })}
                placeholder="Computer Science"
              />
            </label>
            
            <label className="field">
              <span>Funding requirement</span>
              <select
                value={profile.funding_requirement || "Any"}
                onChange={(e) => setProfile({ ...profile, funding_requirement: e.target.value })}
              >
                <option value="Any">Any</option>
                <option value="Full Funding Required">Full Funding Required</option>
                <option value="Partial Funding Acceptable">Partial Funding Acceptable</option>
                <option value="Self-funded">Self-funded</option>
              </select>
            </label>
            <label className="field">
              <span>English proficiency</span>
              <select
                value={profile.english_proficiency || "Not set"}
                onChange={(e) => setProfile({ ...profile, english_proficiency: e.target.value })}
              >
                <option value="Not set">Not set</option>
                <option value="Native">Native</option>
                <option value="IELTS 7.0+">IELTS 7.0+</option>
                <option value="IELTS 6.5+">IELTS 6.5+</option>
                <option value="TOEFL 100+">TOEFL 100+</option>
                <option value="Other">Other</option>
              </select>
            </label>
            
            <label className="field">
              <span>Current GPA (optional)</span>
              <input
                type="text"
                value={profile.current_gpa || ""}
                onChange={(e) => setProfile({ ...profile, current_gpa: e.target.value })}
                placeholder="e.g. 3.8/4.0"
              />
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <label className="checkbox-label" style={{ marginTop: "24px" }}>
                <input
                  type="checkbox"
                  checked={profile.nationality_opt_in}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      nationality_opt_in: e.target.checked,
                      nationality: e.target.checked ? profile.nationality : null,
                    })
                  }
                />
                Include my nationality
              </label>
            </div>

            {profile.nationality_opt_in && (
              <label className="field full-width">
                <span>Nationality</span>
                <input
                  type="text"
                  value={profile.nationality || ""}
                  onChange={(e) => setProfile({ ...profile, nationality: e.target.value })}
                />
              </label>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="secondary" type="button" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button className="primary" type="button" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Hunt Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
