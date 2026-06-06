import React, { useId, useState } from "react";
import { ChevronDown, Filter, Search, X } from "lucide-react";
import "./news.css";

interface FilterPanelProps {
  onApplyFilters: (filters: any) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
}

const FilterSection = ({ title, children, count = 0, defaultOpen = true }: FilterSectionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={`filter-section ${isOpen ? "expanded" : ""} ${count > 0 ? "has-selection" : ""}`}>
      <button
        type="button"
        className="filter-section-trigger"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="filter-section-title">{title}</span>
        <span className="filter-section-meta">
          {count > 0 && <span className="filter-selection-count">{count}</span>}
          <ChevronDown className="filter-section-chevron" size={16} aria-hidden="true" />
        </span>
      </button>
      {isOpen && <div id={contentId} className="checkbox-group">{children}</div>}
    </section>
  );
};

const countSelectedItems = (items: string[], selectedItems: string[]) => (
  items.reduce((count, item) => count + (selectedItems.includes(item) ? 1 : 0), 0)
);

interface FilterGroupProps {
  title: string;
  children: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
}

const FilterGroup = ({ title, children, count = 0, defaultOpen = false }: FilterGroupProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <section className={`filter-option-group ${isOpen ? "expanded" : ""} ${count > 0 ? "has-selection" : ""}`}>
      <button
        type="button"
        className="filter-option-group-trigger"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="filter-option-group-title">{title}</span>
        <span className="filter-option-group-meta">
          {count > 0 && <span className="filter-selection-count filter-selection-count--small">{count}</span>}
          <ChevronDown className="filter-option-group-chevron" size={14} aria-hidden="true" />
        </span>
      </button>
      {isOpen && <div id={contentId} className="filter-option-group-content">{children}</div>}
    </section>
  );
};

export function FilterPanel({ onApplyFilters, isOpen, onClose }: FilterPanelProps) {
  const [levels, setLevels] = useState<string[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [fundingTypes, setFundingTypes] = useState<string[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [fieldsOfStudy, setFieldsOfStudy] = useState<string[]>([]);
  const [popularScholarships, setPopularScholarships] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const selectedCount = levels.length
    + seasons.length
    + fundingTypes.length
    + regions.length
    + fieldsOfStudy.length
    + popularScholarships.length;

  const toggleLevel = (val: string) => {
    setError(null);
    setLevels(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };
  const toggleSeason = (val: string) => {
    setSeasons(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };
  const toggleFunding = (val: string) => {
    setFundingTypes(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };
  const toggleRegion = (val: string) => {
    setRegions(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };
  const toggleFieldOfStudy = (val: string) => {
    setFieldsOfStudy(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };
  const togglePopular = (val: string) => {
    setError(null);
    setPopularScholarships(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const handleApply = () => {
    if (levels.length === 0 && popularScholarships.length === 0) {
      setError("Please select at least one Scholarship Level or Popular Scholarship.");
      return;
    }
    setError(null);
    onApplyFilters({
      levels: levels.length ? levels : undefined,
      seasons: seasons.length ? seasons : undefined,
      funding_types: fundingTypes.length ? fundingTypes : undefined,
      countries: regions.length ? regions : undefined,
      fields_of_study: fieldsOfStudy.length ? fieldsOfStudy : undefined,
      popular_scholarships: popularScholarships.length ? popularScholarships : undefined,
    });
    if (window.innerWidth <= 768) {
      onClose();
    }
  };

  const handleClear = () => {
    setLevels([]);
    setSeasons([]);
    setFundingTypes([]);
    setRegions([]);
    setFieldsOfStudy([]);
    setPopularScholarships([]);
    setError(null);
    onApplyFilters({});
  };

  const countries = ["USA", "Canada", "Australia", "New Zealand", "UK", "Saudi Arabia", "Qatar", "UAE", "Germany"];
  const continents = ["Africa", "South America", "Asia", "North America", "Europe", "Australia (continent)"];

  const studyAreas = [
    { group: "Engineering", items: ["Electrical & Electronics Engineering (EEE)", "Mechanical Engineering", "Civil & Structural Engineering", "Chemical Engineering", "Aerospace Engineering", "Industrial & Systems Engineering", "Biomedical Engineering"] },
    { group: "Technology & Computing", items: ["Computer Science & Engineering", "Software Engineering", "Artificial Intelligence & Data Science", "Cybersecurity", "Information Technology", "Human-Computer Interaction"] },
    { group: "Business & Economics", items: ["Business Administration (BBA/MBA)", "Economics & Finance", "Accounting", "Marketing & Management", "International Business", "Entrepreneurship"] },
    { group: "Health & Medicine", items: ["Medicine & Surgery", "Public Health", "Pharmacy", "Nursing", "Dentistry", "Veterinary Science"] },
    { group: "Natural Sciences", items: ["Physics", "Chemistry", "Biology & Life Sciences", "Mathematics & Statistics", "Environmental Science", "Earth & Atmospheric Sciences"] },
    { group: "Law & Social Sciences", items: ["Law & Legal Studies", "Political Science & International Relations", "Sociology & Anthropology", "Psychology", "Development Studies", "Gender Studies"] },
    { group: "Arts, Humanities & Design", items: ["Architecture & Urban Planning", "Fine Arts & Design", "Literature & Linguistics", "History & Philosophy", "Media & Communications", "Music & Performing Arts"] },
    { group: "Agriculture & Environment", items: ["Agriculture & Food Science", "Forestry & Wildlife", "Climate & Sustainability", "Marine Science"] },
    { group: "Education & Others", items: ["Education & Teaching", "Library & Information Science", "Theology & Religious Studies", "Interdisciplinary / Other"] }
  ];

  const popularScholarshipsList = [
    { group: "Europe", items: ["Erasmus Mundus (EU)", "Stipendium Hungaricum (Hungary)", "Chevening Scholarship (UK)", "DAAD Scholarship (Germany)", "Switzerland Government Excellence (Switzerland)", "Holland Scholarship (Netherlands)", "Swedish Institute Scholarship (Sweden)", "Eiffel Excellence Scholarship (France)", "Romanian Government Scholarship"] },
    { group: "Global / Multinational", items: ["Aga Khan Foundation Scholarship", "Gates Cambridge Scholarship", "Rhodes Scholarship (Oxford)", "World Bank Scholarship (JJ/WBGSP)", "OPEC Fund Scholarship"] },
    { group: "Asia & Middle East", items: ["CSC Scholarship / Chinese Government Scholarship (China)", "MEXT Scholarship (Japan)", "Korean Government Scholarship - KGSP (South Korea)", "Taiwan ICDF Scholarship", "Turkish Government Scholarship - Türkiye Bursları", "Malaysian Commonwealth Scholarship", "Singapore International Graduate Award (SINGA)"] },
    { group: "Americas", items: ["Fulbright Scholarship (USA)", "OAS Scholarship (Organization of American States)", "Canadian Government Scholarships (CGSP)"] },
    { group: "Africa & Others", items: ["Mastercard Foundation Scholarship", "African Union Scholarship", "Commonwealth Scholarship (Various)"] }
  ];

  return (
    <aside className={`filter-panel ${isOpen ? "open" : "closed"}`}>
      <div className="filter-header">
        <div className="filter-title">
          <span className="filter-title-icon"><Filter size={17} /></span>
          <div>
            <h2>Refine results</h2>
            <p>{selectedCount > 0 ? `${selectedCount} selected` : "Choose your criteria"}</p>
          </div>
        </div>
        <button className="icon-button filter-close-button" onClick={onClose} aria-label="Close filters">
          <X size={18} />
        </button>
      </div>

      <div className="filter-content">
        <FilterSection title="Scholarship level" count={levels.length} defaultOpen={true}>
          {["Bachelor's", "Master's", "PhD", "Postdoctoral", "Short Course"].map(level => (
            <label key={level} className="checkbox-label">
              <input type="checkbox" checked={levels.includes(level)} onChange={() => toggleLevel(level)} />
              <span>{level}</span>
            </label>
          ))}
        </FilterSection>

        <FilterSection title="Popular scholarships" count={popularScholarships.length} defaultOpen={false}>
          {popularScholarshipsList.map(popGroup => (
            <FilterGroup
              key={popGroup.group}
              title={popGroup.group}
              count={countSelectedItems(popGroup.items, popularScholarships)}
            >
              {popGroup.items.map(scholarship => (
                <label key={scholarship} className="checkbox-label">
                  <input type="checkbox" checked={popularScholarships.includes(scholarship)} onChange={() => togglePopular(scholarship)} />
                  <span>{scholarship}</span>
                </label>
              ))}
            </FilterGroup>
          ))}
        </FilterSection>

        <FilterSection title="Region" count={regions.length} defaultOpen={false}>
          <FilterGroup title="Countries" count={countSelectedItems(countries, regions)}>
            {countries.map(region => (
              <label key={region} className="checkbox-label">
                <input type="checkbox" checked={regions.includes(region)} onChange={() => toggleRegion(region)} />
                <span>{region}</span>
              </label>
            ))}
          </FilterGroup>
          <FilterGroup title="Continents" count={countSelectedItems(continents, regions)}>
            {continents.map(region => (
              <label key={region} className="checkbox-label">
                <input type="checkbox" checked={regions.includes(region)} onChange={() => toggleRegion(region)} />
                <span>{region}</span>
              </label>
            ))}
          </FilterGroup>
        </FilterSection>

        <FilterSection title="Study area" count={fieldsOfStudy.length} defaultOpen={false}>
          {studyAreas.map(areaGroup => (
            <FilterGroup
              key={areaGroup.group}
              title={areaGroup.group}
              count={countSelectedItems(areaGroup.items, fieldsOfStudy)}
            >
              {areaGroup.items.map(field => (
                <label key={field} className="checkbox-label">
                  <input type="checkbox" checked={fieldsOfStudy.includes(field)} onChange={() => toggleFieldOfStudy(field)} />
                  <span>{field}</span>
                </label>
              ))}
            </FilterGroup>
          ))}
        </FilterSection>

        <FilterSection title="Season" count={seasons.length} defaultOpen={false}>
          {["Fall", "Spring", "Summer", "Winter"].map(season => (
            <label key={season} className="checkbox-label">
              <input type="checkbox" checked={seasons.includes(season)} onChange={() => toggleSeason(season)} />
              <span>{season}</span>
            </label>
          ))}
        </FilterSection>

        <FilterSection title="Funding type" count={fundingTypes.length} defaultOpen={false}>
          {["Fully Funded", "Partially Funded", "Tuition Waiver", "Stipend", "Travel Grant"].map(funding => (
            <label key={funding} className="checkbox-label">
              <input type="checkbox" checked={fundingTypes.includes(funding)} onChange={() => toggleFunding(funding)} />
              <span>{funding}</span>
            </label>
          ))}
        </FilterSection>
      </div>

      <div className="filter-actions">
        {error && <div className="filter-error" role="alert">{error}</div>}
        <div className="filter-action-buttons">
          <button className="button-secondary" onClick={handleClear} disabled={selectedCount === 0}>Clear</button>
          <button className="button-primary" onClick={handleApply}>
            <Search size={16} aria-hidden="true" />
            Search
          </button>
        </div>
      </div>
    </aside>
  );
}
