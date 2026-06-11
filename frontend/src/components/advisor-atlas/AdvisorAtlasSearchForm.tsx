import { FormEvent, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Building2, Search, Sparkles, UserRoundSearch } from "lucide-react";
import { CreateAdvisorRun, SearchDepth, SearchMode } from "../../lib/advisorAtlasApi";

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

const depthOptions: Array<{
  value: SearchDepth;
  title: string;
  description: string;
  icon: typeof Search;
}> = [
  {
    value: "quick",
    title: "Quick Map",
    description: "Fast faculty scan",
    icon: Search,
  },
  {
    value: "deep",
    title: "Deep Atlas",
    description: "Full evidence search",
    icon: Sparkles,
  },
  {
    value: "focused",
    title: "Focused Dossier",
    description: "One professor",
    icon: BookOpen,
  },
];

export function AdvisorAtlasSearchForm({ submitting, onSubmit }: Props) {
  const [mode, setMode] = useState<SearchMode>("department");
  const [depth, setDepth] = useState<SearchDepth>("deep");
  const [showProfile, setShowProfile] = useState(false);
  const [form, setForm] = useState({
    universityName: "",
    universityUrl: "",
    department: "",
    professorName: "",
    degreeTarget: "PhD",
    intakeTerm: "",
    field: "",
    researchQuestion: "",
    keywords: "",
    methodsKnown: "",
    methodsToLearn: "",
    tools: "",
    experience: "",
    constraints: "",
    exclusions: "",
    careerDirection: "",
  });
  const [error, setError] = useState("");

  const effectiveMode = depth === "focused" ? "professor" : mode;
  const externalContext = useMemo(
    () => [
      form.universityName,
      form.department,
      form.professorName,
      form.field,
      form.researchQuestion,
      form.keywords,
      form.methodsKnown,
      form.methodsToLearn,
      form.experience,
      form.constraints,
      form.careerDirection,
    ].filter(Boolean),
    [form],
  );

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (effectiveMode === "department" && (!form.universityName.trim() || !form.department.trim())) {
      setError("University and department are required for a department search.");
      return;
    }
    if (effectiveMode === "professor" && !form.professorName.trim()) {
      setError("Professor name is required for a Focused Dossier.");
      return;
    }
    await onSubmit({
      mode: effectiveMode,
      search_depth: depth,
      university_name: form.universityName.trim() || undefined,
      university_url: form.universityUrl.trim() || undefined,
      department: form.department.trim() || undefined,
      professor_name: form.professorName.trim() || undefined,
      degree_target: form.degreeTarget || undefined,
      intake_term: form.intakeTerm.trim() || undefined,
      approved_domains: form.universityUrl.trim() ? [form.universityUrl.trim()] : [],
      research_profile: {
        field: form.field.trim() || undefined,
        research_question: form.researchQuestion.trim() || undefined,
        keywords: splitList(form.keywords),
        methods_known: splitList(form.methodsKnown),
        methods_to_learn: splitList(form.methodsToLearn),
        tools_and_datasets: splitList(form.tools),
        prior_experience: form.experience.trim() || undefined,
        constraints: form.constraints.trim() || undefined,
        exclusions: splitList(form.exclusions),
        career_direction: form.careerDirection.trim() || undefined,
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
            className={effectiveMode === "department" ? "active" : ""}
            onClick={() => {
              setMode("department");
              if (depth === "focused") setDepth("deep");
            }}
          >
            <Building2 size={17} /> Department
          </button>
          <button
            type="button"
            className={effectiveMode === "professor" ? "active" : ""}
            onClick={() => {
              setMode("professor");
              setDepth("focused");
            }}
          >
            <UserRoundSearch size={17} /> Professor
          </button>
        </div>
      </div>

      <div className="atlas-depth-grid" aria-label="Search depth">
        {depthOptions.map((option) => {
          const Icon = option.icon;
          return (
            <button
              type="button"
              key={option.value}
              className={depth === option.value ? "atlas-depth active" : "atlas-depth"}
              onClick={() => {
                setDepth(option.value);
                if (option.value === "focused") setMode("professor");
              }}
            >
              <Icon size={19} />
              <span><strong>{option.title}</strong><small>{option.description}</small></span>
            </button>
          );
        })}
      </div>

      <div className="atlas-form-grid">
        <label>
          <span>University name {effectiveMode === "department" ? "*" : ""}</span>
          <input value={form.universityName} onChange={(e) => update("universityName", e.target.value)} placeholder="e.g. University of Toronto" />
        </label>
        <label>
          <span>Official URL</span>
          <input type="url" value={form.universityUrl} onChange={(e) => update("universityUrl", e.target.value)} placeholder="https://..." />
        </label>
        <label>
          <span>Department {effectiveMode === "department" ? "*" : ""}</span>
          <input value={form.department} onChange={(e) => update("department", e.target.value)} placeholder="Computer Science" />
        </label>
        {effectiveMode === "professor" ? (
          <label>
            <span>Professor name *</span>
            <input value={form.professorName} onChange={(e) => update("professorName", e.target.value)} placeholder="Professor full name" />
          </label>
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
        <label>
          <span>Intake</span>
          <input value={form.intakeTerm} onChange={(e) => update("intakeTerm", e.target.value)} placeholder="Fall 2027" />
        </label>
        {effectiveMode === "professor" && (
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
        <span><strong>Add research interests</strong><small>Optional, for better matching</small></span>
        <ArrowRight size={17} className={showProfile ? "rotated" : ""} />
      </button>

      {showProfile && (
        <div className="atlas-profile-builder">
          <label>
            <span>Research field</span>
            <input value={form.field} onChange={(e) => update("field", e.target.value)} placeholder="Human-computer interaction" />
          </label>
          <label className="wide">
            <span>Research question or problem</span>
            <textarea value={form.researchQuestion} onChange={(e) => update("researchQuestion", e.target.value)} placeholder="What do you want to investigate?" rows={3} />
          </label>
          <label>
            <span>Topics and keywords</span>
            <textarea value={form.keywords} onChange={(e) => update("keywords", e.target.value)} placeholder="AI literacy, learning analytics, accessibility" rows={3} />
          </label>
          <label>
            <span>Methods you already know</span>
            <textarea value={form.methodsKnown} onChange={(e) => update("methodsKnown", e.target.value)} placeholder="Interviews, Python, causal inference" rows={3} />
          </label>
          <label>
            <span>Methods you want to learn</span>
            <textarea value={form.methodsToLearn} onChange={(e) => update("methodsToLearn", e.target.value)} placeholder="Eye tracking, mixed methods" rows={3} />
          </label>
          <label>
            <span>Tools, datasets or populations</span>
            <textarea value={form.tools} onChange={(e) => update("tools", e.target.value)} placeholder="PyTorch, longitudinal student data" rows={3} />
          </label>
          <label className="wide">
            <span>Prior thesis, projects or experience</span>
            <textarea value={form.experience} onChange={(e) => update("experience", e.target.value)} placeholder="Briefly describe evidence that you are prepared for this work." rows={3} />
          </label>
          <label>
            <span>Constraints</span>
            <textarea value={form.constraints} onChange={(e) => update("constraints", e.target.value)} placeholder="Funding required, location, intake timing" rows={3} />
          </label>
          <label>
            <span>Hard exclusions</span>
            <textarea value={form.exclusions} onChange={(e) => update("exclusions", e.target.value)} placeholder="Topics or approaches you do not want" rows={3} />
          </label>
          <label className="wide">
            <span>Career direction</span>
            <input value={form.careerDirection} onChange={(e) => update("careerDirection", e.target.value)} placeholder="Academic research, applied R&D, policy..." />
          </label>
        </div>
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
