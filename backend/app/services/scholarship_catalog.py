"""Zero-cost, code-shipped catalog of major scholarships (Phase 0 of the
Scholarship Hunt pipeline, see AI-Context/planbook/scholarship-hunt-pipeline.md).

Seeded from the canonical names already used for Scholarship Hunt query
targeting (``news_service.SCHOLARSHIP_ALIASES``). Metadata below is
hand-authored and deliberately conservative: funding coverage is qualitative
("full"/"partial") rather than an invented dollar amount, and cycle months
describe a *typical* application window rather than a hard current-year
deadline. Exact current-cycle specifics come from the paid "Check current
cycle" action (one Tavily search), not from this static file.

Favor a smaller, verifiably-accurate list over padding to a target count with
fabricated details.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

CATALOG: List[Dict[str, Any]] = [
    {
        "id": "erasmus-mundus",
        "canonical_name": "Erasmus Mundus Joint Masters",
        "aliases": ["Erasmus Mundus", "Erasmus Mundus Joint Master", "EMJM"],
        "sponsor": "European Commission",
        "levels": ["master's"],
        "destinations": ["Europe"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly allowance, travel and installation costs."},
        "cycle_months": ["October", "January"],
        "portal_url": "https://erasmus-plus.ec.europa.eu",
        "blurb": "Fully funded joint master's programs delivered by consortia of European universities.",
    },
    {
        "id": "stipendium-hungaricum",
        "canonical_name": "Stipendium Hungaricum",
        "aliases": ["Stipendium Hungaricum"],
        "sponsor": "Government of Hungary",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Hungary"],
        "funding": {"coverage": "full", "notes": "Tuition waiver, monthly stipend, and housing contribution."},
        "cycle_months": ["November", "January"],
        "portal_url": "https://stipendiumhungaricum.hu",
        "blurb": "Hungary's government scholarship for international students at all degree levels.",
    },
    {
        "id": "chevening",
        "canonical_name": "Chevening Scholarship",
        "aliases": ["Chevening Scholarship", "Chevening"],
        "sponsor": "UK Government (FCDO)",
        "levels": ["master's"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition, living stipend, and travel costs for a one-year master's."},
        "cycle_months": ["August", "November"],
        "portal_url": "https://www.chevening.org",
        "blurb": "UK government scholarship for future leaders to pursue a one-year master's degree.",
    },
    {
        "id": "daad",
        "canonical_name": "DAAD Scholarship",
        "aliases": ["DAAD Scholarship", "DAAD"],
        "sponsor": "German Academic Exchange Service",
        "levels": ["master's", "phd"],
        "destinations": ["Germany"],
        "funding": {"coverage": "full", "notes": "Coverage varies by programme; most include a monthly stipend and insurance."},
        "cycle_months": ["October", "January"],
        "portal_url": "https://www.daad.de",
        "blurb": "Germany's national scholarship agency, funding hundreds of programme-specific scholarships.",
    },
    {
        "id": "swiss-government-excellence",
        "canonical_name": "Swiss Government Excellence Scholarship",
        "aliases": ["Swiss Government Excellence Scholarship", "Swiss Government Excellence Scholarships"],
        "sponsor": "Swiss Confederation",
        "levels": ["master's", "phd", "postdoctoral"],
        "destinations": ["Switzerland"],
        "funding": {"coverage": "full", "notes": "Monthly stipend, insurance, and partial travel costs."},
        "cycle_months": ["September", "December"],
        "portal_url": "https://www.sbfi.admin.ch",
        "blurb": "Switzerland's federal scholarship for postgraduate research and doctoral study.",
    },
    {
        "id": "holland-scholarship",
        "canonical_name": "Holland Scholarship",
        "aliases": ["Holland Scholarship", "NL Scholarship"],
        "sponsor": "Dutch Ministry of Education / Dutch universities",
        "levels": ["bachelor's", "master's"],
        "destinations": ["Netherlands"],
        "funding": {"coverage": "partial", "notes": "One-time grant applied toward the first year of study."},
        "cycle_months": ["February", "May"],
        "portal_url": "https://www.studyinnl.org",
        "blurb": "A one-time grant for non-EEA students starting a Dutch bachelor's or master's programme.",
    },
    {
        "id": "sisgp",
        "canonical_name": "Swedish Institute Scholarships for Global Professionals",
        "aliases": ["Swedish Institute Scholarship", "Swedish Institute Scholarships for Global Professionals", "SISGP"],
        "sponsor": "Swedish Institute",
        "levels": ["master's"],
        "destinations": ["Sweden"],
        "funding": {"coverage": "full", "notes": "Tuition, living costs, insurance, and travel grant."},
        "cycle_months": ["January", "February"],
        "portal_url": "https://si.se",
        "blurb": "Sweden's scholarship for master's students from countries with early-stage development.",
    },
    {
        "id": "eiffel-excellence",
        "canonical_name": "Eiffel Excellence Scholarship",
        "aliases": ["Eiffel Excellence Scholarship", "Eiffel Scholarship"],
        "sponsor": "French Ministry for Europe and Foreign Affairs",
        "levels": ["master's", "phd"],
        "destinations": ["France"],
        "funding": {"coverage": "full", "notes": "Monthly allowance plus travel and select insurance costs."},
        "cycle_months": ["December", "January"],
        "portal_url": "https://www.france-excellence.campusfrance.org",
        "blurb": "France's flagship scholarship for high-potential international master's and PhD students.",
    },
    {
        "id": "romanian-government",
        "canonical_name": "Romanian Government Scholarship",
        "aliases": ["Romanian Government Scholarship"],
        "sponsor": "Government of Romania",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Romania"],
        "funding": {"coverage": "full", "notes": "Tuition waiver plus monthly stipend."},
        "cycle_months": ["March", "June"],
        "portal_url": "https://www.roscholarship.mae.ro",
        "blurb": "Romania's scholarship programme for international students at all degree levels.",
    },
    {
        "id": "csc",
        "canonical_name": "Chinese Government Scholarship",
        "aliases": ["Chinese Government Scholarship", "CSC Scholarship"],
        "sponsor": "China Scholarship Council",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["China"],
        "funding": {"coverage": "full", "notes": "Tuition, accommodation, stipend, and medical insurance."},
        "cycle_months": ["January", "April"],
        "portal_url": "https://www.campuschina.org",
        "blurb": "China's national scholarship for international students, administered with partner universities.",
    },
    {
        "id": "mext",
        "canonical_name": "MEXT Scholarship",
        "aliases": ["MEXT Scholarship", "Monbukagakusho Scholarship"],
        "sponsor": "Japanese Ministry of Education (MEXT)",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Japan"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly stipend, and round-trip airfare."},
        "cycle_months": ["April", "June", "November"],
        "portal_url": "https://www.studyinjapan.go.jp",
        "blurb": "Japan's government scholarship, applied for via embassy or direct university recommendation.",
    },
    {
        "id": "gks",
        "canonical_name": "Global Korea Scholarship",
        "aliases": ["Global Korea Scholarship", "Korean Government Scholarship", "GKS", "KGSP"],
        "sponsor": "Government of South Korea (NIIED)",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["South Korea"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly stipend, settlement allowance, and airfare."},
        "cycle_months": ["February", "September"],
        "portal_url": "https://www.studyinkorea.go.kr",
        "blurb": "South Korea's government scholarship, applied for via embassy or university track.",
    },
    {
        "id": "taiwan-icdf",
        "canonical_name": "Taiwan ICDF Scholarship",
        "aliases": ["TaiwanICDF Scholarship", "Taiwan ICDF Scholarship"],
        "sponsor": "Taiwan International Cooperation and Development Fund",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Taiwan"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly living allowance, and insurance."},
        "cycle_months": ["February", "March"],
        "portal_url": "https://www.icdf.org.tw",
        "blurb": "Taiwan's development-cooperation scholarship for students from partner countries.",
    },
    {
        "id": "turkiye-scholarships",
        "canonical_name": "Türkiye Scholarships",
        "aliases": ["Türkiye Scholarships", "Türkiye Bursları", "Turkiye Scholarships", "Turkiye Burslari"],
        "sponsor": "Government of Turkey",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Turkey"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly stipend, housing, and health insurance."},
        "cycle_months": ["January", "February"],
        "portal_url": "https://www.turkiyeburslari.gov.tr",
        "blurb": "Turkey's national scholarship for international students across all degree levels.",
    },
    {
        "id": "malaysian-commonwealth",
        "canonical_name": "Malaysian Commonwealth Scholarship",
        "aliases": ["Malaysian Commonwealth Scholarship", "Malaysia International Scholarship"],
        "sponsor": "Government of Malaysia",
        "levels": ["master's", "phd"],
        "destinations": ["Malaysia"],
        "funding": {"coverage": "partial", "notes": "Coverage varies by award track; confirm via the official portal."},
        "cycle_months": [],
        "portal_url": "https://www.mohe.gov.my",
        "blurb": "Malaysia's scholarship track for Commonwealth-country postgraduate students.",
    },
    {
        "id": "singa",
        "canonical_name": "Singapore International Graduate Award",
        "aliases": ["Singapore International Graduate Award", "SINGA"],
        "sponsor": "A*STAR (Singapore)",
        "levels": ["phd"],
        "destinations": ["Singapore"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly stipend, and settling-in/airfare allowance."},
        "cycle_months": ["December"],
        "portal_url": "https://www.singa.a-star.edu.sg",
        "blurb": "Singapore's PhD scholarship for research in science and engineering at A*STAR-linked universities.",
    },
    {
        "id": "mastercard-foundation",
        "canonical_name": "Mastercard Foundation Scholars Program",
        "aliases": ["Mastercard Foundation Scholars Program", "Mastercard Foundation Scholarship"],
        "sponsor": "Mastercard Foundation",
        "levels": ["bachelor's", "master's"],
        "destinations": ["Africa"],
        "funding": {"coverage": "full", "notes": "Coverage and cycle vary by partner university; confirm on the partner's page."},
        "cycle_months": [],
        "portal_url": "https://mastercardfdnscholars.org",
        "blurb": "Funds African students at a network of partner universities worldwide.",
    },
    {
        "id": "african-union",
        "canonical_name": "African Union Scholarship",
        "aliases": ["African Union Scholarship"],
        "sponsor": "African Union",
        "levels": ["master's", "phd"],
        "destinations": ["Africa"],
        "funding": {"coverage": "partial", "notes": "Coverage varies by cycle and host institution."},
        "cycle_months": [],
        "portal_url": "https://au.int",
        "blurb": "African Union-administered scholarships for postgraduate study across the continent.",
    },
    {
        "id": "commonwealth",
        "canonical_name": "Commonwealth Scholarship",
        "aliases": ["Commonwealth Scholarship", "Commonwealth Scholarships"],
        "sponsor": "UK Commonwealth Scholarship Commission",
        "levels": ["master's", "phd"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition, living stipend, and travel costs."},
        "cycle_months": ["October", "December"],
        "portal_url": "https://cscuk.fcdo.gov.uk",
        "blurb": "UK-funded scholarships for citizens of Commonwealth countries.",
    },
    {
        "id": "fulbright",
        "canonical_name": "Fulbright Foreign Student Program",
        "aliases": ["Fulbright Scholarship", "Fulbright"],
        "sponsor": "U.S. Department of State",
        "levels": ["master's", "phd"],
        "destinations": ["United States"],
        "funding": {"coverage": "full", "notes": "Tuition, living stipend, health insurance, and travel."},
        "cycle_months": ["February", "May"],
        "portal_url": "https://foreign.fulbrightonline.org",
        "blurb": "U.S. government scholarship administered per-country via local Fulbright commissions.",
    },
    {
        "id": "oas",
        "canonical_name": "OAS Academic Scholarship",
        "aliases": ["OAS Scholarship", "OAS Academic Scholarship"],
        "sponsor": "Organization of American States",
        "levels": ["master's", "phd"],
        "destinations": ["Americas"],
        "funding": {"coverage": "partial", "notes": "Partial tuition support; living costs are the applicant's responsibility."},
        "cycle_months": [],
        "portal_url": "https://www.oas.org/en/scholarships",
        "blurb": "Partial academic scholarships for graduate study among OAS member states.",
    },
    {
        "id": "canada-graduate-scholarships",
        "canonical_name": "Canada Graduate Scholarships",
        "aliases": ["Canadian Government Scholarship", "Canada Graduate Scholarships", "CGS"],
        "sponsor": "Government of Canada",
        "levels": ["master's", "phd"],
        "destinations": ["Canada"],
        "funding": {"coverage": "full", "notes": "Annual stipend; amount and duration vary by award level."},
        "cycle_months": ["October", "November"],
        "portal_url": "https://vanier.gc.ca",
        "blurb": "Canada's federal graduate scholarship programme, including the Vanier award for doctoral study.",
    },
    {
        "id": "aga-khan-foundation",
        "canonical_name": "Aga Khan Foundation Scholarship",
        "aliases": ["Aga Khan Foundation Scholarship"],
        "sponsor": "Aga Khan Foundation",
        "levels": ["master's", "phd"],
        "destinations": ["Global"],
        "funding": {"coverage": "partial", "notes": "Typically split between a grant and a repayable loan."},
        "cycle_months": ["March", "May"],
        "portal_url": "https://www.akdn.org",
        "blurb": "Need-based postgraduate scholarships for students from select developing countries.",
    },
    {
        "id": "gates-cambridge",
        "canonical_name": "Gates Cambridge Scholarship",
        "aliases": ["Gates Cambridge Scholarship"],
        "sponsor": "Bill & Melinda Gates Foundation / University of Cambridge",
        "levels": ["master's", "phd"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition, maintenance allowance, and additional grants."},
        "cycle_months": ["October", "December"],
        "portal_url": "https://www.gatescambridge.org",
        "blurb": "Fully funded scholarship for postgraduate study at the University of Cambridge.",
    },
    {
        "id": "rhodes",
        "canonical_name": "Rhodes Scholarship",
        "aliases": ["Rhodes Scholarship"],
        "sponsor": "Rhodes Trust / University of Oxford",
        "levels": ["master's"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition, stipend, and travel; deadlines vary by constituency/country."},
        "cycle_months": ["July", "October"],
        "portal_url": "https://www.rhodeshouse.ox.ac.uk",
        "blurb": "One of the oldest international postgraduate scholarships, funding study at Oxford.",
    },
    {
        "id": "jj-wbgsp",
        "canonical_name": "Joint Japan World Bank Graduate Scholarship",
        "aliases": ["Joint Japan World Bank Graduate Scholarship", "JJ/WBGSP", "World Bank Scholarship"],
        "sponsor": "World Bank / Government of Japan",
        "levels": ["master's"],
        "destinations": ["Global"],
        "funding": {"coverage": "full", "notes": "Tuition, living stipend, travel, and insurance."},
        "cycle_months": ["March", "April"],
        "portal_url": "https://www.worldbank.org/en/programs/scholarships",
        "blurb": "For students from World Bank member developing countries pursuing development-related master's study.",
    },
    {
        "id": "opec-fund",
        "canonical_name": "OPEC Fund Scholarship",
        "aliases": ["OPEC Fund Scholarship"],
        "sponsor": "OPEC Fund for International Development",
        "levels": ["master's"],
        "destinations": ["Global"],
        "funding": {"coverage": "partial", "notes": "One-time award applied toward tuition and related costs."},
        "cycle_months": ["February", "March"],
        "portal_url": "https://opecfund.org",
        "blurb": "A one-time scholarship award for students from OPEC Fund partner developing countries.",
    },
]


def normalize_url(url: str) -> str:
    """Shared normalization for opportunity dedupe keys (catalog, extraction,
    bookmark migration). Keeps host + path (two different scholarship pages
    on the same domain must not collide) but drops scheme, "www.", query
    string, and fragment."""
    parsed = urlparse(url.strip().lower())
    host = (parsed.netloc or "").removeprefix("www.")
    path = parsed.path.rstrip("/") if parsed.netloc else parsed.path
    return f"{host}{path}" if host else path


def list_catalog(
    levels: Optional[List[str]] = None,
    destinations: Optional[List[str]] = None,
    funding_coverage: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Filter the static catalog. Pure function, no network calls."""
    entries = CATALOG
    if levels:
        wanted = {v.strip().lower() for v in levels}
        entries = [e for e in entries if wanted & {lv.lower() for lv in e["levels"]}]
    if destinations:
        wanted = {v.strip().lower() for v in destinations}
        entries = [e for e in entries if wanted & {d.lower() for d in e["destinations"]}]
    if funding_coverage:
        wanted = {v.strip().lower() for v in funding_coverage}
        entries = [e for e in entries if e["funding"]["coverage"].lower() in wanted]
    return entries


def get_catalog_entry(catalog_id: str) -> Optional[Dict[str, Any]]:
    for entry in CATALOG:
        if entry["id"] == catalog_id:
            return entry
    return None


def catalog_entry_normalized_url(entry: Dict[str, Any]) -> str:
    return normalize_url(entry["portal_url"])
