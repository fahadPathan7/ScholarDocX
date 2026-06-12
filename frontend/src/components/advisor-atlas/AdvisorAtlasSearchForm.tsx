import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Building2, Compass, Search, Sparkles, UserRoundSearch } from "lucide-react";
import { CreateAdvisorRun, SearchMode } from "../../lib/advisorAtlasApi";

type Props = {
  submitting: boolean;
  onSubmit: (payload: CreateAdvisorRun) => Promise<void>;
};

function splitList(value: string) {
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}



export function AdvisorAtlasSearchForm({ submitting, onSubmit }: Props) {
  const [mode, setMode] = useState<SearchMode>("department");
  const [showProfile, setShowProfile] = useState(true);
  const [form, setForm] = useState({
    universityName: "",
    universityUrl: "",
    department: "",
    professorName: "",
    degreeTarget: "PhD",
    intakeTerm: "",
    interests: [""],
  });
  const [error, setError] = useState("");
  const externalContext = useMemo(
    () => [
      form.universityName,
      form.department,
      form.professorName,
      ...form.interests.filter(Boolean),
    ].filter(Boolean),
    [form],
  );

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateInterest = (index: number, value: string) => {
    setForm(current => {
      const interests = [...current.interests];
      interests[index] = value;
      return { ...current, interests };
    });
  };

  const addInterest = () => {
    if (form.interests.length < 5) {
      setForm(current => ({ ...current, interests: [...current.interests, ""] }));
    }
  };

  const removeInterest = (index: number) => {
    setForm(current => {
      if (current.interests.length <= 1) return current;
      const interests = [...current.interests];
      interests.splice(index, 1);
      return { ...current, interests };
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (mode === "department" && (!form.universityName.trim() || !form.department.trim())) {
      setError("University and department are required for a discovery search.");
      return;
    }
    if (mode === "professor" && (!form.professorName.trim() || !form.universityName.trim())) {
      setError("Professor name and university name are required for a professor search.");
      return;
    }
    const validInterests = form.interests.map(i => i.trim()).filter(Boolean);
    if (mode === "department" && validInterests.length === 0) {
      setError("At least one research interest is required for a discovery search.");
      return;
    }

    await onSubmit({
      mode,
      university_name: form.universityName.trim() || undefined,
      university_url: form.universityUrl.trim() || undefined,
      department: form.department.trim() || undefined,
      professor_name: form.professorName.trim() || undefined,
      degree_target: form.degreeTarget || undefined,
      intake_term: mode === "professor" ? (form.intakeTerm.trim() || undefined) : undefined,
      approved_domains: form.universityUrl.trim() ? [form.universityUrl.trim()] : [],
      research_profile: {
        interests: form.interests.map(i => i.trim()).filter(Boolean),
      },
    });
  };

  return (
    <form className="atlas-search-card" onSubmit={submit}>
      <div className="atlas-search-heading">
        <div>
          <span className="atlas-eyebrow">New search</span>
          <h2>Find the right supervisor.</h2>
        </div>
        <div className="atlas-mode-toggle" role="group" aria-label="Search mode">
          <button
            type="button"
            className={mode === "department" ? "active" : ""}
            onClick={() => setMode("department")}
          >
            <Compass size={17} /> Discovery
          </button>
          <button
            type="button"
            className={mode === "professor" ? "active" : ""}
            onClick={() => setMode("professor")}
          >
            <UserRoundSearch size={17} /> Professor
          </button>
        </div>
      </div>



      <div className="atlas-form-grid">
        <label>
          <span>University name *</span>
          <input value={form.universityName} onChange={(e) => update("universityName", e.target.value)} placeholder="e.g. University of Toronto" />
        </label>
        <label>
          <span>Official URL</span>
          <input type="url" value={form.universityUrl} onChange={(e) => update("universityUrl", e.target.value)} placeholder="https://..." />
        </label>
        <label>
          <span>Department {mode === "department" ? "*" : ""}</span>
          <input value={form.department} onChange={(e) => update("department", e.target.value)} placeholder="Computer Science" />
        </label>
        {mode === "professor" ? (
          <>
            <label>
              <span>Professor name *</span>
              <input value={form.professorName} onChange={(e) => update("professorName", e.target.value)} placeholder="Professor full name" />
            </label>
            <label>
              <span>Intake</span>
              <input value={form.intakeTerm} onChange={(e) => update("intakeTerm", e.target.value)} placeholder="Fall 2027" />
            </label>
            <label>
              <span>Degree target</span>
              <select value={form.degreeTarget} onChange={(e) => update("degreeTarget", e.target.value)}>
                <option>PhD</option>
                <option>Research Master's</option>
                <option>Either</option>
              </select>
            </label>
          </>
        ) : (
          <label>
            <span>Degree target</span>
            <select value={form.degreeTarget} onChange={(e) => update("degreeTarget", e.target.value)}>
              <option>PhD</option>
              <option>Research Master's</option>
              <option>Either</option>
            </select>
          </label>
        )}
      </div>

      {mode === "department" && (
        <>
          <button type="button" className="atlas-profile-toggle" onClick={() => setShowProfile((value) => !value)} aria-expanded={showProfile}>
            <Sparkles size={17} />
            <span><strong>Add research interests</strong><small>Required for broad discovery search</small></span>
            <ArrowRight size={17} className={showProfile ? "rotated" : ""} />
          </button>

          {showProfile && (
            <div className="atlas-profile-builder">
              <div className="atlas-interests-list">
                {form.interests.map((interest, index) => (
                  <label key={index} className="wide">
                    <span>Research Interest {index + 1} {index === 0 ? "*" : ""}</span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <input
                        value={interest}
                        onChange={(e) => updateInterest(index, e.target.value)}
                        placeholder={index === 0 ? "e.g., Human-computer interaction" : "e.g., AI literacy"}
                        style={{ flex: 1 }}
                      />
                      {form.interests.length > 1 && (
                        <button type="button" onClick={() => removeInterest(index)} className="atlas-remove-interest" aria-label="Remove interest" style={{ background: "transparent", border: "1px solid #ddd", borderRadius: "6px", padding: "0 12px", cursor: "pointer", color: "#666" }}>✕</button>
                      )}
                    </div>
                  </label>
                ))}
                {form.interests.length < 5 && (
                  <button type="button" onClick={addInterest} style={{ alignSelf: "flex-start", background: "none", border: "none", color: "var(--atlas-teal)", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem", padding: "4px 0" }}>
                    + Add another interest
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div className="atlas-search-footer">
        <div className="atlas-privacy-note">
          {externalContext.length} profile fields · public web only · saved locally
        </div>
        {error && <div className="atlas-inline-error" role="alert">{error}</div>}
        <button className="atlas-primary-button" disabled={submitting}>
          {submitting ? <span className="atlas-spinner" /> : <Search size={18} />}
          {submitting ? "Starting..." : "Start search"}
        </button>
      </div>
    </form>
  );
}
