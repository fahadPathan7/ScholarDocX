import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, Compass, Plus, Search, Sparkles, UserRoundSearch, X } from "lucide-react";
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
  const completedRequired = useMemo(() => {
    const hasInterest = form.interests.some((interest) => interest.trim().length >= 2);
    return mode === "professor"
      ? [
          form.universityName,
          form.universityUrl,
          form.department,
          form.professorName,
          form.intakeTerm,
          form.degreeTarget,
          hasInterest ? "interest" : "",
        ].filter((value) => value.trim()).length
      : [
          form.universityName,
          form.department,
          hasInterest ? "interest" : "",
        ].filter((value) => value.trim()).length;
  }, [form, mode]);
  const requiredTotal = mode === "professor" ? 7 : 3;

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
    if (mode === "professor") {
      const missing = [
        ["university name", form.universityName],
        ["official professor URL", form.universityUrl],
        ["department or research area", form.department],
        ["professor name", form.professorName],
        ["intended intake", form.intakeTerm],
        ["degree target", form.degreeTarget],
      ].filter(([, value]) => !value.trim()).map(([label]) => label);
      if (missing.length) {
        setError(`Professor search requires ${missing.join(", ")}.`);
        return;
      }
      if (form.professorName.trim().split(/\s+/).length < 2) {
        setError("Enter the professor's full name, including at least first and last name.");
        return;
      }
      try {
        const officialUrl = new URL(form.universityUrl.trim());
        if (!["http:", "https:"].includes(officialUrl.protocol)) throw new Error();
      } catch {
        setError("Enter a complete official HTTP or HTTPS university or professor URL.");
        return;
      }
      if (!/^(Spring|Summer|Fall|Autumn|Winter)\s+20\d{2}$/i.test(form.intakeTerm.trim())) {
        setError("Enter an intake term and year, for example Fall 2027.");
        return;
      }
    }
    const validInterests = form.interests.map(i => i.trim()).filter(Boolean);
    if (validInterests.length === 0) {
      setError(`At least one research interest is required for ${mode === "department" ? "discovery" : "professor matching"}.`);
      return;
    }
    if (validInterests.some((interest) => interest.length < 2)) {
      setError("Each research interest must contain at least two characters.");
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
          <span className="atlas-eyebrow">Advisor intelligence engine</span>
          <h2>{mode === "department" ? "Map an entire advisor landscape." : "Investigate one professor deeply."}</h2>
          <p>
            {mode === "department"
              ? "We map related departments first, then narrow verified faculty by research fit and PhD opportunity."
              : "Build a source-backed brief across background, lab, students, papers, funding, and recruitment."}
          </p>
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
        <label className="wide">
          <span>University name *</span>
          <input required value={form.universityName} onChange={(e) => update("universityName", e.target.value)} placeholder="e.g. University of Toronto" />
        </label>
        <label className="wide">
          <span>{mode === "department" ? "Official university URL" : "Official professor URL *"}</span>
          <input
            id="atlas-official-url"
            type="url"
            required={mode === "professor"}
            aria-describedby={mode === "professor" ? "atlas-official-url-help" : undefined}
            value={form.universityUrl}
            onChange={(e) => update("universityUrl", e.target.value)}
            placeholder={mode === "department" ? "https://www.university.edu/..." : "https://www.university.edu/faculty/..."}
          />
          {mode === "professor" && <small id="atlas-official-url-help" className="atlas-field-help">Anchors identity to the correct institution and faculty domain.</small>}
        </label>
        <label>
          <span>{mode === "department" ? "Research field *" : "Department or research area *"}</span>
          <input
            required
            aria-describedby={mode === "professor" ? "atlas-department-help" : undefined}
            value={form.department}
            onChange={(e) => update("department", e.target.value)}
            placeholder="e.g. Computer Science"
          />
          {mode === "professor" && <small id="atlas-department-help" className="atlas-field-help">Disambiguates names and focuses lab, paper, and funding searches.</small>}
        </label>
        {mode === "professor" ? (
          <>
            <label>
              <span>Professor name *</span>
              <input required value={form.professorName} onChange={(e) => update("professorName", e.target.value)} placeholder="Professor full name" />
            </label>
            <label>
              <span>Intended intake *</span>
              <input
                required
                aria-describedby="atlas-intake-help"
                value={form.intakeTerm}
                onChange={(e) => update("intakeTerm", e.target.value)}
                placeholder="Fall 2027"
              />
              <small id="atlas-intake-help" className="atlas-field-help">Required for the next two-to-three-semester recruitment outlook.</small>
            </label>
            <label>
              <span>Degree target *</span>
              <select required value={form.degreeTarget} onChange={(e) => update("degreeTarget", e.target.value)}>
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

      <button type="button" className="atlas-profile-toggle" onClick={() => setShowProfile((value) => !value)} aria-expanded={showProfile}>
        <Sparkles size={17} />
        <span>
          <strong>Your research interests *</strong>
          <small>
            {mode === "professor"
              ? "Compared semantically with this professor's verified research"
              : "Used for semantic similarity, not exact keyword matching"}
          </small>
        </span>
        <ArrowRight size={17} className={showProfile ? "rotated" : ""} />
      </button>

      {showProfile && (
        <div className="atlas-profile-builder">
          <div className="atlas-interests-list">
            {form.interests.map((interest, index) => (
              <label key={index} className="wide">
                <span>Research Interest {index + 1} {index === 0 ? "*" : ""}</span>
                <div className="atlas-interest-row">
                  <input
                    required={index === 0}
                    minLength={index === 0 ? 2 : undefined}
                    maxLength={200}
                    value={interest}
                    onChange={(e) => updateInterest(index, e.target.value)}
                    placeholder={index === 0 ? "e.g., Human-computer interaction" : "e.g., AI literacy"}
                  />
                  {form.interests.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInterest(index)}
                      className="atlas-remove-interest"
                      aria-label={`Remove research interest ${index + 1}`}
                    >
                      <X size={17} />
                    </button>
                  )}
                </div>
              </label>
            ))}
            {form.interests.length < 5 && (
              <button type="button" onClick={addInterest} className="atlas-add-interest">
                <Plus size={16} /> Add another interest
              </button>
            )}
          </div>
        </div>
      )}

      <div className="atlas-search-footer">
        <div>
          <div className="atlas-privacy-note">
            {completedRequired}/{requiredTotal} required inputs ready · public web only · saved locally
          </div>
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
