import React, { useState } from "react";
import { Filter, ChevronDown, ChevronUp, X } from "lucide-react";
import "./news.css";

interface FilterPanelProps {
  onApplyFilters: (filters: any) => void;
  isOpen: boolean;
  onClose: () => void;
}

const FilterSection = ({ title, children, defaultOpen = true }: { title: string, children: React.ReactNode, defaultOpen?: boolean }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="filter-section">
      <h3 
        onClick={() => setIsOpen(!isOpen)} 
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        {title}
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </h3>
      {isOpen && <div className="checkbox-group">{children}</div>}
    </div>
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
    { group: "💻 Technology & Computing", items: ["Computer Science & Engineering", "Software Engineering", "Artificial Intelligence & Data Science", "Cybersecurity", "Information Technology", "Human-Computer Interaction"] },
    { group: "⚡ Engineering", items: ["Electrical & Electronics Engineering (EEE)", "Mechanical Engineering", "Civil & Structural Engineering", "Chemical Engineering", "Aerospace Engineering", "Industrial & Systems Engineering", "Biomedical Engineering"] },
    { group: "💼 Business & Economics", items: ["Business Administration (BBA/MBA)", "Economics & Finance", "Accounting", "Marketing & Management", "International Business", "Entrepreneurship"] },
    { group: "🔬 Natural Sciences", items: ["Physics", "Chemistry", "Biology & Life Sciences", "Mathematics & Statistics", "Environmental Science", "Earth & Atmospheric Sciences"] },
    { group: "🏥 Health & Medicine", items: ["Medicine & Surgery", "Public Health", "Pharmacy", "Nursing", "Dentistry", "Veterinary Science"] },
    { group: "⚖️ Law & Social Sciences", items: ["Law & Legal Studies", "Political Science & International Relations", "Sociology & Anthropology", "Psychology", "Development Studies", "Gender Studies"] },
    { group: "🎨 Arts, Humanities & Design", items: ["Architecture & Urban Planning", "Fine Arts & Design", "Literature & Linguistics", "History & Philosophy", "Media & Communications", "Music & Performing Arts"] },
    { group: "🌾 Agriculture & Environment", items: ["Agriculture & Food Science", "Forestry & Wildlife", "Climate & Sustainability", "Marine Science"] },
    { group: "🎓 Education & Others", items: ["Education & Teaching", "Library & Information Science", "Theology & Religious Studies", "Interdisciplinary / Other"] }
  ];

  const popularScholarshipsList = [
    { group: "🇪🇺 Europe", items: ["Erasmus Mundus (EU)", "Stipendium Hungaricum (Hungary)", "Chevening Scholarship (UK)", "DAAD Scholarship (Germany)", "Switzerland Government Excellence (Switzerland)", "Holland Scholarship (Netherlands)", "Swedish Institute Scholarship (Sweden)", "Eiffel Excellence Scholarship (France)", "Romanian Government Scholarship"] },
    { group: "🌏 Asia & Middle East", items: ["CSC Scholarship / Chinese Government Scholarship (China)", "MEXT Scholarship (Japan)", "Korean Government Scholarship - KGSP (South Korea)", "Taiwan ICDF Scholarship", "Turkish Government Scholarship - Türkiye Bursları", "Malaysian Commonwealth Scholarship", "Singapore International Graduate Award (SINGA)"] },
    { group: "🌍 Africa & Others", items: ["Mastercard Foundation Scholarship", "African Union Scholarship", "Commonwealth Scholarship (Various)"] },
    { group: "🌎 Americas", items: ["Fulbright Scholarship (USA)", "OAS Scholarship (Organization of American States)", "Canadian Government Scholarships (CGSP)"] },
    { group: "🌐 Global / Multinational", items: ["Aga Khan Foundation Scholarship", "Gates Cambridge Scholarship", "Rhodes Scholarship (Oxford)", "World Bank Scholarship (JJ/WBGSP)", "OPEC Fund Scholarship"] }
  ];

  return (
    <aside className={`filter-panel ${isOpen ? "open" : "closed"}`}>
      <div className="filter-header">
        <div className="filter-title">
          <Filter size={18} />
          <h2>Filters</h2>
        </div>
        <button className="icon-button" onClick={onClose} style={{ color: '#65756d' }}>
          <X size={18} />
        </button>
      </div>

      <div className="filter-content">
        <FilterSection title="Scholarship Level" defaultOpen={true}>
          {["Bachelor's", "Master's", "PhD", "Postdoctoral", "Short Course"].map(level => (
            <label key={level} className="checkbox-label">
              <input type="checkbox" checked={levels.includes(level)} onChange={() => toggleLevel(level)} />
              <span>{level}</span>
            </label>
          ))}
        </FilterSection>

        <FilterSection title="Region" defaultOpen={false}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#65756d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Countries</div>
          {countries.map(region => (
            <label key={region} className="checkbox-label">
              <input type="checkbox" checked={regions.includes(region)} onChange={() => toggleRegion(region)} />
              <span>{region}</span>
            </label>
          ))}
          <div style={{ margin: '4px 0', borderTop: '1px solid rgba(47, 109, 122, 0.15)', width: '100%' }} />
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#65756d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Continents</div>
          {continents.map(region => (
            <label key={region} className="checkbox-label">
              <input type="checkbox" checked={regions.includes(region)} onChange={() => toggleRegion(region)} />
              <span>{region}</span>
            </label>
          ))}
        </FilterSection>

        <FilterSection title="Study Area" defaultOpen={false}>
          {studyAreas.map((areaGroup, idx) => (
            <div key={areaGroup.group}>
              {idx > 0 && <div style={{ margin: '4px 0', borderTop: '1px solid rgba(47, 109, 122, 0.15)', width: '100%' }} />}
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#65756d', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: idx > 0 ? '8px' : '0' }}>{areaGroup.group}</div>
              {areaGroup.items.map(field => (
                <label key={field} className="checkbox-label">
                  <input type="checkbox" checked={fieldsOfStudy.includes(field)} onChange={() => toggleFieldOfStudy(field)} />
                  <span>{field}</span>
                </label>
              ))}
            </div>
          ))}
        </FilterSection>

        <FilterSection title="Season" defaultOpen={false}>
          {["Fall", "Spring", "Summer", "Winter"].map(season => (
            <label key={season} className="checkbox-label">
              <input type="checkbox" checked={seasons.includes(season)} onChange={() => toggleSeason(season)} />
              <span>{season}</span>
            </label>
          ))}
        </FilterSection>

        <FilterSection title="Funding Type" defaultOpen={false}>
          {["Fully Funded", "Partially Funded", "Tuition Waiver", "Stipend", "Travel Grant"].map(funding => (
            <label key={funding} className="checkbox-label">
              <input type="checkbox" checked={fundingTypes.includes(funding)} onChange={() => toggleFunding(funding)} />
              <span>{funding}</span>
            </label>
          ))}
        </FilterSection>

        <FilterSection title="Popular Scholarships" defaultOpen={false}>
          {popularScholarshipsList.map((popGroup, idx) => (
            <div key={popGroup.group}>
              {idx > 0 && <div style={{ margin: '4px 0', borderTop: '1px solid rgba(47, 109, 122, 0.15)', width: '100%' }} />}
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#65756d', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: idx > 0 ? '8px' : '0' }}>{popGroup.group}</div>
              {popGroup.items.map(scholarship => (
                <label key={scholarship} className="checkbox-label">
                  <input type="checkbox" checked={popularScholarships.includes(scholarship)} onChange={() => togglePopular(scholarship)} />
                  <span>{scholarship}</span>
                </label>
              ))}
            </div>
          ))}
        </FilterSection>
      </div>

      <div className="filter-actions" style={{ flexDirection: 'column' }}>
        {error && <div style={{ color: '#d9534f', fontSize: '0.8rem', fontWeight: 600, paddingBottom: '12px', textAlign: 'center' }}>{error}</div>}
        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <button className="button-secondary" onClick={handleClear}>Clear</button>
          <button className="button-primary" onClick={handleApply}>Search</button>
        </div>
      </div>
    </aside>
  );
}
