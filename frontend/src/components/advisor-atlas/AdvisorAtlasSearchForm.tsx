import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Compass, Search, Sparkles, UserRoundSearch } from "lucide-react";
import {
  AdvisorResearchDefaults,
  CreateAdvisorRun,
  SearchMode,
  getAdvisorResearchDefaults,
} from "../../lib/advisorAtlasApi";
import { AdvisorResearchDefaultsModal } from "./AdvisorResearchDefaultsModal";
import { useAuth } from "../../contexts/AuthContext";

type Props = {
  submitting: boolean;
  onSubmit: (payload: CreateAdvisorRun) => Promise<void>;
};

const EMPTY_DEFAULTS: AdvisorResearchDefaults = { interests: [], degree_target: "", intake_term: "" };

export function AdvisorAtlasSearchForm({ submitting, onSubmit }: Props) {
  const { user } = useAuth();
  const [mode, setMode] = useState<SearchMode>("department");
  const [form, setForm] = useState({
    universityName: "",
    universityUrl: "",
    department: "",
    professorName: "",
  });
  const [error, setError] = useState("");

  // SCHOLARDOCX-0189/0190: research interests, degree target, and intended
  // intake are no longer per-search fields here — they live once in the
  // user's Advisor Atlas Research Defaults (edited from this same view, not
  // the Profile page) and are read directly at submit time. Editing them
  // here always updates the saved defaults; there is no separate per-search
  // copy to keep in sync.
  const [defaultsProfileId, setDefaultsProfileId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<AdvisorResearchDefaults>(EMPTY_DEFAULTS);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  const [showDefaultsModal, setShowDefaultsModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAdvisorResearchDefaults().then(({ profileId, defaults }) => {
      if (cancelled) return;
      setDefaultsProfileId(profileId);
      setDefaults(defaults);
      setDefaultsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasDefaults = defaults.interests.length > 0 || !!defaults.degree_target || !!defaults.intake_term;

  const completedRequired = useMemo(() => {
    const hasInterest = defaults.interests.some((interest) => interest.trim().length >= 2);
    return mode === "professor"
      ? [
          form.universityName,
          form.universityUrl,
          form.department,
          form.professorName,
          defaults.intake_term,
          defaults.degree_target,
          hasInterest ? "interest" : "",
        ].filter((value) => value.trim()).length
      : [
          form.universityName,
          form.department,
          hasInterest ? "interest" : "",
        ].filter((value) => value.trim()).length;
  }, [form, defaults, mode]);
  const requiredTotal = mode === "professor" ? 7 : 3;

  const update = (key: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
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
      if (!defaults.intake_term.trim() || !defaults.degree_target.trim()) {
        setError("Set your intended intake and degree target in Research Defaults before starting a professor search.");
        return;
      }
      if (!/^(Spring|Summer|Fall|Autumn|Winter)\s+20\d{2}$/i.test(defaults.intake_term.trim())) {
        setError("Your saved intended intake isn't a valid term. Update it in Research Defaults, for example Fall 2027.");
        return;
      }
    }
    const validInterests = defaults.interests.map((i) => i.trim()).filter(Boolean);
    if (validInterests.length === 0) {
      setError(`At least one research interest is required. Add one in Research Defaults for ${mode === "department" ? "discovery" : "professor matching"}.`);
      return;
    }
    if (validInterests.some((interest) => interest.length < 2)) {
      setError("Each research interest in Research Defaults must contain at least two characters.");
      return;
    }

    await onSubmit({
      mode,
      university_name: form.universityName.trim() || undefined,
      university_url: form.universityUrl.trim() || undefined,
      department: form.department.trim() || undefined,
      professor_name: form.professorName.trim() || undefined,
      degree_target: defaults.degree_target || undefined,
      intake_term: mode === "professor" ? (defaults.intake_term.trim() || undefined) : undefined,
      approved_domains: form.universityUrl.trim() ? [form.universityUrl.trim()] : [],
      research_profile: {
        interests: validInterests,
      },
    });
  };

  const defaultsSummary = !defaultsLoaded
    ? "Loading…"
    : hasDefaults
      ? `${defaults.interests.length} interest${defaults.interests.length === 1 ? "" : "s"} · ${defaults.degree_target || "No degree target"} · ${defaults.intake_term || "No intake"}`
      : "Not set up yet — every search needs at least one interest";

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
        {mode === "professor" && (
          <label>
            <span>Professor name *</span>
            <input required value={form.professorName} onChange={(e) => update("professorName", e.target.value)} placeholder="Professor full name" />
          </label>
        )}
      </div>

      <button type="button" className="atlas-profile-toggle" onClick={() => setShowDefaultsModal(true)}>
        <Sparkles size={17} />
        <span>
          <strong>Research defaults *</strong>
          <small>{defaultsSummary}</small>
        </span>
        <ArrowRight size={17} />
      </button>

      <div className="atlas-search-footer">
        <div>
          <div className="atlas-privacy-note">
            {completedRequired}/{requiredTotal} required inputs ready · public web only · private to your account
          </div>
        </div>
        {error && <div className="atlas-inline-error" role="alert">{error}</div>}
        <button className="atlas-primary-button" disabled={submitting}>
          {submitting ? <span className="atlas-spinner" /> : <Search size={18} />}
          {submitting ? "Starting..." : "Start search"}
        </button>
      </div>

      {showDefaultsModal && (
        <AdvisorResearchDefaultsModal
          profileId={defaultsProfileId}
          defaults={defaults}
          email={user?.email}
          onClose={() => setShowDefaultsModal(false)}
          onSaved={(savedId, savedDefaults) => {
            setDefaultsProfileId(savedId);
            setDefaults(savedDefaults);
          }}
        />
      )}
    </form>
  );
}
