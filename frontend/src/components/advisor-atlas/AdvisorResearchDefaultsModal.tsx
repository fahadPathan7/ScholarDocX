import { FormEvent, useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { Modal } from "../Modal";
import {
  AdvisorResearchDefaults,
  saveAdvisorResearchDefaults,
} from "../../lib/advisorAtlasApi";
import "./advisor-atlas.css";

/**
 * Edit Advisor Atlas research defaults (SCHOLARDOCX-0189) — interests, degree
 * target, intended intake — opened from the Advisor Atlas search form itself.
 * There is no separate per-search copy of these fields: saving here is what
 * every subsequent search uses.
 */
export function AdvisorResearchDefaultsModal({
  profileId,
  defaults,
  email,
  onClose,
  onSaved,
}: {
  profileId: string | null;
  defaults: AdvisorResearchDefaults;
  email?: string;
  onClose: () => void;
  onSaved: (profileId: string, defaults: AdvisorResearchDefaults) => void;
}) {
  const [interests, setInterests] = useState<string[]>(
    defaults.interests.length ? defaults.interests : [""]
  );
  const [degreeTarget, setDegreeTarget] = useState(defaults.degree_target || "PhD");
  const [intakeTerm, setIntakeTerm] = useState(defaults.intake_term || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const updateInterest = (index: number, value: string) => {
    setInterests((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  };

  const addInterest = () => {
    if (interests.length < 5) setInterests((current) => [...current, ""]);
  };

  const removeInterest = (index: number) => {
    setInterests((current) => (current.length <= 1 ? current : current.filter((_, i) => i !== index)));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    // This form is rendered via <Modal>'s createPortal, so it sits outside
    // the search form in the actual DOM — but React's synthetic events
    // still bubble through the *React* tree, not the DOM tree, across a
    // portal boundary. Without stopping it here, saving defaults also fires
    // AdvisorAtlasSearchForm's onSubmit and shows its own validation error.
    event.stopPropagation();
    setError("");
    setSubmitting(true);
    try {
      const cleaned: AdvisorResearchDefaults = {
        interests: interests.map((i) => i.trim()).filter(Boolean),
        degree_target: degreeTarget,
        intake_term: intakeTerm.trim(),
      };
      const savedId = await saveAdvisorResearchDefaults(profileId, cleaned, email);
      onSaved(savedId, cleaned);
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to save research defaults.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal onClose={onClose}>
      <form className="modal-panel small-modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-header">
          <h2>Advisor Atlas Research Defaults</h2>
          <button className="icon-button" type="button" onClick={onClose} title="Close form">
            <X size={20} />
          </button>
        </div>
        <div className="modal-content" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {error && <p className="empty" style={{ color: "#c0392b" }}>{error}</p>}
          <p className="profile-system-hint" style={{ margin: 0 }}>
            Used for every Advisor Atlas search you start — there's no
            separate per-search copy, so saving here updates what your next
            search uses immediately.
          </p>
          <label className="field">
            <span>Degree target</span>
            <select value={degreeTarget} onChange={(e) => setDegreeTarget(e.target.value)}>
              <option>PhD</option>
              <option>Research Master's</option>
              <option>Either</option>
            </select>
          </label>
          <label className="field">
            <span>Intended intake</span>
            <input
              value={intakeTerm}
              onChange={(e) => setIntakeTerm(e.target.value)}
              placeholder="Fall 2027"
            />
          </label>
          <div>
            <span style={{ display: "block", marginBottom: "8px", fontWeight: 600, fontSize: "13px" }}>
              Research interests
            </span>
            <div className="atlas-interests-list">
              {interests.map((interest, index) => (
                <label key={index} className="field wide">
                  <span>Interest {index + 1}</span>
                  <div className="atlas-interest-row">
                    <input
                      maxLength={200}
                      value={interest}
                      onChange={(e) => updateInterest(index, e.target.value)}
                      placeholder="e.g., Human-computer interaction"
                    />
                    {interests.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInterest(index)}
                        className="atlas-remove-interest"
                        aria-label={`Remove interest ${index + 1}`}
                      >
                        <X size={17} />
                      </button>
                    )}
                  </div>
                </label>
              ))}
              {interests.length < 5 && (
                <button type="button" onClick={addInterest} className="atlas-add-interest">
                  <Plus size={16} /> Add another interest
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="modal-footer" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: "12px", flexWrap: "wrap" }}>
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={submitting}>
            <Save size={16} /> {submitting ? "Saving..." : "Save defaults"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
