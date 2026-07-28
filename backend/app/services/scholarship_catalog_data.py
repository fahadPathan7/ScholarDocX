"""Static scholarship catalog data (SCHOLARDOCX-0176).

The ``CATALOG`` list of scholarship entries. See ``scholarship_catalog.py``
for the module docstring describing the entry schema, helpers, and the
categorization policy. Split out so the data file can grow without pushing
the helpers module over the file-size limit.
"""

from typing import Any, Dict, List

CATALOG: List[Dict[str, Any]] = [
    # ── Program / central scholarships ──────────────────────────────────────
    {
        "id": "erasmus-mundus",
        "category": "program",
        "canonical_name": "Erasmus Mundus Joint Masters",
        "aliases": ["Erasmus Mundus", "Erasmus Mundus Joint Master", "EMJM"],
        "sponsor": "European Commission",
        "levels": ["master's"],
        "destinations": ["Europe"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly allowance, travel and installation costs."},
        "cycle_months": ["October", "January"],
        "links": [
            {"label": "Official page", "url": "https://erasmus-plus.ec.europa.eu"},
            {"label": "Find a programme", "url": "https://www.eacea.ec.europa.eu/scholarships_en"},
        ],
        "tags": ["master's", "Europe", "consortium", "full funding", "EU", "mobility"],
        "blurb": "Fully funded joint master's programs delivered by consortia of European universities.",
        "description": (
            "Erasmus Mundus Joint Masters are high-level international study programs delivered by "
            "consortia of higher education institutions across at least three European countries. "
            "Students study in at least two of those countries and receive a joint, double, or multiple "
            "degree. The scholarship covers tuition, a monthly living allowance, travel, and installation "
            "costs. Programs span nearly every discipline and are among the EU's flagship academic offers."
        ),
    },
    {
        "id": "stipendium-hungaricum",
        "category": "program",
        "canonical_name": "Stipendium Hungaricum",
        "aliases": ["Stipendium Hungaricum"],
        "sponsor": "Government of Hungary",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Hungary"],
        "funding": {"coverage": "full", "notes": "Tuition waiver, monthly stipend, and housing contribution."},
        "cycle_months": ["November", "January"],
        "links": [
            {"label": "Official page", "url": "https://stipendiumhungaricum.hu"},
            {"label": "Application portal", "url": "https://apply.stipendiumhungaricum.hu"},
        ],
        "tags": ["Hungary", "Europe", "full funding", "government", "all levels"],
        "blurb": "Hungary's government scholarship for international students at all degree levels.",
        "description": (
            "Stipendium Hungaricum is the Government of Hungary's scholarship program for international "
            "students, established under bilateral educational cooperation agreements. It covers tuition, "
            "a monthly stipend, and a housing contribution for bachelor's, master's, and doctoral study "
            "at Hungarian higher education institutions. Eligibility is country-specific and applicants "
            "apply through their home country's nominating authority as well as the online portal."
        ),
    },
    {
        "id": "chevening",
        "category": "program",
        "canonical_name": "Chevening Scholarship",
        "aliases": ["Chevening Scholarship", "Chevening"],
        "sponsor": "UK Government (FCDO)",
        "levels": ["master's"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition, living stipend, and travel costs for a one-year master's."},
        "cycle_months": ["August", "November"],
        "links": [
            {"label": "Official page", "url": "https://www.chevening.org"},
            {"label": "Eligibility checker", "url": "https://www.chevening.org/eligibility/"},
        ],
        "tags": ["UK", "Europe", "master's", "full funding", "leadership", "government"],
        "blurb": "UK government scholarship for future leaders to pursue a one-year master's degree.",
        "description": (
            "Chevening is the UK government's international awards scheme aimed at developing global "
            "leaders. It funds a one-year taught master's degree at any UK university, covering full "
            "tuition, a monthly living stipend, and return travel. Applicants must demonstrate leadership "
            "potential and a clear plan to use the master's to drive positive change in their home "
            "country. Selection is competitive and country-specific."
        ),
    },
    {
        "id": "daad",
        "category": "program",
        "canonical_name": "DAAD Scholarship",
        "aliases": ["DAAD Scholarship", "DAAD"],
        "sponsor": "German Academic Exchange Service",
        "levels": ["master's", "phd"],
        "destinations": ["Germany"],
        "funding": {"coverage": "full", "notes": "Coverage varies by programme; most include a monthly stipend and insurance."},
        "cycle_months": ["October", "January"],
        "links": [
            {"label": "Official page", "url": "https://www.daad.de"},
            {"label": "Find a scholarship", "url": "https://www.daad.de/en/study-and-research-in-germany/scholarships/"},
        ],
        "tags": ["Germany", "Europe", "master's", "PhD", "full funding", "research"],
        "blurb": "Germany's national scholarship agency, funding hundreds of programme-specific scholarships.",
        "description": (
            "The German Academic Exchange Service (DAAD) is one of the world's largest scholarship "
            "agencies. It funds hundreds of program-specific scholarships for international students, "
            "ranging from EPOS/EPMM graduate programs to research grants. Coverage typically includes a "
            "monthly stipend, health insurance, and travel. Each program has its own deadline, target "
            "disciplines, and eligibility — applicants must find the program that fits them via the DAAD "
            "database."
        ),
    },
    {
        "id": "swiss-government-excellence",
        "category": "program",
        "canonical_name": "Swiss Government Excellence Scholarship",
        "aliases": ["Swiss Government Excellence Scholarship", "Swiss Government Excellence Scholarships"],
        "sponsor": "Swiss Confederation",
        "levels": ["master's", "phd", "postdoctoral"],
        "destinations": ["Switzerland"],
        "funding": {"coverage": "full", "notes": "Monthly stipend, insurance, and partial travel costs."},
        "cycle_months": ["September", "December"],
        "links": [
            {"label": "Official page", "url": "https://www.sbfi.admin.ch"},
            {"label": "Scholarship details", "url": "https://www.sbfi.admin.ch/sbfi/en/home/education/scholarships-and-grants/swiss-government-excellence-scholarships.html"},
        ],
        "tags": ["Switzerland", "Europe", "PhD", "research", "full funding", "master's"],
        "blurb": "Switzerland's federal scholarship for postgraduate research and doctoral study.",
        "description": (
            "The Swiss Government Excellence Scholarships are aimed at young foreign researchers who have "
            "completed a master's or PhD degree, and at foreign students pursuing a master's at a Swiss "
            "conservatory or arts school. They fund research or doctoral stays at Swiss institutions. "
            "Coverage includes a monthly stipend, insurance, and a partial travel allowance."
        ),
    },
    {
        "id": "holland-scholarship",
        "category": "program",
        "canonical_name": "Holland Scholarship",
        "aliases": ["Holland Scholarship", "NL Scholarship"],
        "sponsor": "Dutch Ministry of Education / Dutch universities",
        "levels": ["bachelor's", "master's"],
        "destinations": ["Netherlands"],
        "funding": {"coverage": "partial", "notes": "One-time grant applied toward the first year of study."},
        "cycle_months": ["February", "May"],
        "links": [
            {"label": "Official page", "url": "https://www.studyinnl.org"},
            {"label": "Participating universities", "url": "https://www.studyinnl.org/finances/nl-scholarship"},
        ],
        "tags": ["Netherlands", "Europe", "partial funding", "first-year", "non-EEA"],
        "blurb": "A one-time grant for non-EEA students starting a Dutch bachelor's or master's programme.",
        "description": (
            "The Holland Scholarship is financed by the Dutch Ministry of Education and Dutch research "
            "universities and universities of applied sciences. It is a one-time payment of €5,000 toward "
            "the first year of study for non-EEA international students starting a bachelor's or master's "
            "in the Netherlands. It is not a full scholarship and is designed to help with initial costs."
        ),
    },
    {
        "id": "sisgp",
        "category": "program",
        "canonical_name": "Swedish Institute Scholarships for Global Professionals",
        "aliases": ["Swedish Institute Scholarship", "Swedish Institute Scholarships for Global Professionals", "SISGP"],
        "sponsor": "Swedish Institute",
        "levels": ["master's"],
        "destinations": ["Sweden"],
        "funding": {"coverage": "full", "notes": "Tuition, living costs, insurance, and travel grant."},
        "cycle_months": ["January", "February"],
        "links": [
            {"label": "Official page", "url": "https://si.se"},
            {"label": "Scholarship overview", "url": "https://si.se/en/apply/scholarships/"},
        ],
        "tags": ["Sweden", "Europe", "master's", "full funding", "leadership"],
        "blurb": "Sweden's scholarship for master's students from countries with early-stage development.",
        "description": (
            "The Swedish Institute Scholarships for Global Professionals (SISGP) is a fully funded "
            "scholarship for ambitious professionals from select countries pursuing a full-time master's "
            "in Sweden. It covers tuition, living costs, insurance, and a travel grant. Applicants must "
            "demonstrate leadership and work experience alongside academic merit."
        ),
    },
    {
        "id": "eiffel-excellence",
        "category": "program",
        "canonical_name": "Eiffel Excellence Scholarship",
        "aliases": ["Eiffel Excellence Scholarship", "Eiffel Scholarship"],
        "sponsor": "French Ministry for Europe and Foreign Affairs",
        "levels": ["master's", "phd"],
        "destinations": ["France"],
        "funding": {"coverage": "full", "notes": "Monthly allowance plus travel and select insurance costs."},
        "cycle_months": ["December", "January"],
        "links": [
            {"label": "Official page", "url": "https://www.campusfrance.org/en/france-excellence-eiffel-scholarship-program"},
            {"label": "Programme details", "url": "https://www.campusfrance.org/en/eiffel"},
        ],
        "tags": ["France", "Europe", "master's", "PhD", "full funding", "excellence"],
        "blurb": "France's flagship scholarship for high-potential international master's and PhD students.",
        "description": (
            "The Eiffel Excellence Scholarship is a French government program for future foreign leaders "
            "in the public and private sectors. It funds master's-level study in engineering, economics, "
            "law, and political science, and a 10-month co-tutelle or cotutelle mobility at PhD level. It "
            "pays a monthly allowance plus travel and does not cover tuition, which is the responsibility "
            "of the host institution."
        ),
    },
    {
        "id": "romanian-government",
        "category": "program",
        "canonical_name": "Romanian Government Scholarship",
        "aliases": ["Romanian Government Scholarship"],
        "sponsor": "Government of Romania",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Romania"],
        "funding": {"coverage": "full", "notes": "Tuition waiver plus monthly stipend."},
        "cycle_months": ["March", "June"],
        "links": [
            {"label": "Official page", "url": "https://www.mae.ro/en/node/10251"},
        ],
        "tags": ["Romania", "Europe", "full funding", "government", "all levels"],
        "blurb": "Romania's scholarship programme for international students at all degree levels.",
        "description": (
            "The Romanian Government awards scholarships to citizens of non-EU countries for bachelor's, "
            "master's, and doctoral study in Romania. The scholarship covers full tuition, a monthly "
            "stipend, and accommodation in student hostels. Most programs are taught in Romanian, with a "
            "preparatory language year available."
        ),
    },
    {
        "id": "csc",
        "category": "program",
        "canonical_name": "Chinese Government Scholarship",
        "aliases": ["Chinese Government Scholarship", "CSC Scholarship"],
        "sponsor": "China Scholarship Council",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["China"],
        "funding": {"coverage": "full", "notes": "Tuition, accommodation, stipend, and medical insurance."},
        "cycle_months": ["January", "April"],
        "links": [
            {"label": "Official page", "url": "https://www.campuschina.org"},
            {"label": "Application system", "url": "https://studyinchina.csc.edu.cn"},
        ],
        "tags": ["China", "Asia", "full funding", "government", "all levels"],
        "blurb": "China's national scholarship for international students, administered with partner universities.",
        "description": (
            "The Chinese Government Scholarship (CSC) is a national scholarship for international "
            "students pursuing a degree at a Chinese university. It covers full tuition, accommodation, a "
            "monthly stipend, and medical insurance. Students apply through a Type A (embassy), Type B "
            "(university), or Type C (existing student) channel. Many programs are available in English."
        ),
    },
    {
        "id": "mext",
        "category": "program",
        "canonical_name": "MEXT Scholarship",
        "aliases": ["MEXT Scholarship", "Monbukagakusho Scholarship"],
        "sponsor": "Japanese Ministry of Education (MEXT)",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Japan"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly stipend, and round-trip airfare."},
        "cycle_months": ["April", "June", "November"],
        "links": [
            {"label": "Official page", "url": "https://www.studyinjapan.go.jp"},
        ],
        "tags": ["Japan", "Asia", "full funding", "government", "all levels"],
        "blurb": "Japan's government scholarship, applied for via embassy or direct university recommendation.",
        "description": (
            "The MEXT (Monbukagakusho) Scholarship is the Japanese government's scholarship program for "
            "international students at undergraduate and graduate levels. It covers full tuition, a "
            "monthly stipend, and round-trip airfare. Applications go either through the Japanese embassy "
            "in the applicant's home country (Embassy Recommendation) or directly to a Japanese "
            "university (University Recommendation)."
        ),
    },
    {
        "id": "gks",
        "category": "program",
        "canonical_name": "Global Korea Scholarship",
        "aliases": ["Global Korea Scholarship", "Korean Government Scholarship", "GKS", "KGSP"],
        "sponsor": "Government of South Korea (NIIED)",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["South Korea"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly stipend, settlement allowance, and airfare."},
        "cycle_months": ["February", "September"],
        "links": [
            {"label": "Official page", "url": "https://www.studyinkorea.go.kr"},
        ],
        "tags": ["South Korea", "Asia", "full funding", "government", "all levels"],
        "blurb": "South Korea's government scholarship, applied for via embassy or university track.",
        "description": (
            "The Global Korea Scholarship (GKS) is the Republic of Korea's national scholarship for "
            "international students, administered by NIIED. It funds undergraduate and graduate degree "
            "programs at Korean universities, covering tuition, a monthly stipend, a settlement allowance, "
            "and airfare. Applications go through either the embassy track or the university track, each "
            "with its own deadline."
        ),
    },
    {
        "id": "taiwan-icdf",
        "category": "program",
        "canonical_name": "Taiwan ICDF Scholarship",
        "aliases": ["TaiwanICDF Scholarship", "Taiwan ICDF Scholarship"],
        "sponsor": "Taiwan International Cooperation and Development Fund",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Taiwan"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly living allowance, and insurance."},
        "cycle_months": ["February", "March"],
        "links": [
            {"label": "Official page", "url": "https://www.icdf.org.tw"},
        ],
        "tags": ["Taiwan", "Asia", "full funding", "development"],
        "blurb": "Taiwan's development-cooperation scholarship for students from partner countries.",
        "description": (
            "The TaiwanICDF Scholarship funds students from diplomatic and development partner countries "
            "to pursue a bachelor's, master's, or PhD at a partner Taiwanese university. Programs are "
            "taught in English and cover tuition, a monthly living allowance, and insurance. Disciplines "
            "vary by partner university but focus on development-relevant fields."
        ),
    },
    {
        "id": "turkiye-scholarships",
        "category": "program",
        "canonical_name": "Türkiye Scholarships",
        "aliases": ["Türkiye Scholarships", "Türkiye Bursları", "Turkiye Scholarships", "Turkiye Burslari"],
        "sponsor": "Government of Turkey",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["Turkey"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly stipend, housing, and health insurance."},
        "cycle_months": ["January", "February"],
        "links": [
            {"label": "Official page", "url": "https://www.turkiyeburslari.gov.tr"},
        ],
        "tags": ["Turkey", "Asia", "full funding", "government", "all levels"],
        "blurb": "Turkey's national scholarship for international students across all degree levels.",
        "description": (
            "Türkiye Scholarships is the Government of Turkey's comprehensive scholarship for "
            "international students. It covers tuition, a monthly stipend, accommodation, health "
            "insurance, and a one-year Turkish language course. Undergraduate and graduate programs are "
            "available across nearly all disciplines at Turkish universities."
        ),
    },
    {
        "id": "malaysian-commonwealth",
        "category": "program",
        "canonical_name": "Malaysian Commonwealth Scholarship",
        "aliases": ["Malaysian Commonwealth Scholarship", "Malaysia International Scholarship"],
        "sponsor": "Government of Malaysia",
        "levels": ["master's", "phd"],
        "destinations": ["Malaysia"],
        "funding": {"coverage": "partial", "notes": "Coverage varies by award track; confirm via the official portal."},
        "cycle_months": ["March", "June"],
        "links": [
            {"label": "Official page", "url": "https://www.mohe.gov.my"},
        ],
        "tags": ["Malaysia", "Asia", "partial funding", "Commonwealth", "postgraduate"],
        "blurb": "Malaysia's scholarship track for Commonwealth-country postgraduate students.",
        "description": (
            "The Malaysia International Scholarship (MIS) and the Malaysian Commonwealth Scholarship are "
            "Government of Malaysia awards for postgraduate study at Malaysian universities. They target "
            "talented international students and provide financial support whose exact composition varies "
            "by award track. Confirm the current cycle and coverage on the official portal before applying."
        ),
    },
    {
        "id": "singa",
        "category": "program",
        "canonical_name": "Singapore International Graduate Award",
        "aliases": ["Singapore International Graduate Award", "SINGA"],
        "sponsor": "A*STAR (Singapore)",
        "levels": ["phd"],
        "destinations": ["Singapore"],
        "funding": {"coverage": "full", "notes": "Tuition, monthly stipend, and settling-in/airfare allowance."},
        "cycle_months": ["December"],
        "links": [
            {"label": "A*STAR Scholarships", "url": "https://www.a-star.edu.sg/scholarships/home"},
            {"label": "Application portal", "url": "https://sms-applicant-app.a-star.edu.sg/"},
        ],
        "tags": ["Singapore", "Asia", "PhD", "STEM", "full funding", "research"],
        "blurb": "Singapore's PhD scholarship for research in science and engineering at A*STAR-linked universities.",
        "description": (
            "The Singapore International Graduate Award (SINGA) is a fully funded PhD scholarship for "
            "research in science and engineering at A*STAR research institutes and partner universities "
            "(NUS, NTU, SUTD). It covers full tuition, a monthly stipend, and a settling-in and airfare "
            "allowance. PhD training is delivered in English."
        ),
    },
    {
        "id": "mastercard-foundation",
        "category": "program",
        "canonical_name": "Mastercard Foundation Scholars Program",
        "aliases": ["Mastercard Foundation Scholars Program", "Mastercard Foundation Scholarship"],
        "sponsor": "Mastercard Foundation",
        "levels": ["bachelor's", "master's"],
        "destinations": ["Africa"],
        "funding": {"coverage": "full", "notes": "Coverage and cycle vary by partner university; confirm on the partner's page."},
        "cycle_months": ["September", "January"],
        "links": [
            {"label": "Official page", "url": "https://mastercardfdnscholars.org"},
            {"label": "Find a partner", "url": "https://mastercardfdnscholars.org/where-you-can-study/"},
        ],
        "tags": ["Africa", "all levels", "full funding", "leadership", "need-based"],
        "blurb": "Funds African students at a network of partner universities worldwide.",
        "description": (
            "The Mastercard Foundation Scholars Program is a transformative leadership program that funds "
            "academically talented young Africans, primarily to study in Africa and at select partner "
            "universities worldwide. It covers full tuition, living costs, and wrap-around leadership and "
            "transition support. Each partner university runs its own application and cycle, so confirm "
            "details on the partner's page."
        ),
    },
    {
        "id": "african-union",
        "category": "program",
        "canonical_name": "African Union Scholarship",
        "aliases": ["African Union Scholarship"],
        "sponsor": "African Union",
        "levels": ["master's", "phd"],
        "destinations": ["Africa"],
        "funding": {"coverage": "partial", "notes": "Coverage varies by cycle and host institution."},
        "cycle_months": ["March", "September"],
        "links": [
            {"label": "Official page", "url": "https://au.int"},
        ],
        "tags": ["Africa", "partial funding", "postgraduate", "development"],
        "blurb": "African Union-administered scholarships for postgraduate study across the continent.",
        "description": (
            "The African Union offers scholarships for postgraduate study at African institutions in "
            "priority development areas. Coverage and the application cycle vary by call and host "
            "institution. The program supports African Union members' development goals and is typically "
            "limited to African nationals."
        ),
    },
    {
        "id": "commonwealth",
        "category": "program",
        "canonical_name": "Commonwealth Scholarship",
        "aliases": ["Commonwealth Scholarship", "Commonwealth Scholarships"],
        "sponsor": "UK Commonwealth Scholarship Commission",
        "levels": ["master's", "phd"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition, living stipend, and travel costs."},
        "cycle_months": ["October", "December"],
        "links": [
            {"label": "Official page", "url": "https://cscuk.fcdo.gov.uk"},
            {"label": "How to apply", "url": "https://cscuk.fcdo.gov.uk/scholarships/"},
        ],
        "tags": ["UK", "Europe", "full funding", "Commonwealth", "postgraduate", "development"],
        "blurb": "UK-funded scholarships for citizens of Commonwealth countries.",
        "description": (
            "The Commonwealth Scholarship Commission is the UK's primary scholarship scheme for "
            "Commonwealth countries, funded by the FCDO. It funds master's and doctoral study in the UK "
            "across six themes including science and technology, health systems, and global prosperity. "
            "Applications are made through a nominating body in the applicant's home country. Awards "
            "cover full tuition, a living stipend, and travel."
        ),
    },
    {
        "id": "fulbright",
        "category": "program",
        "canonical_name": "Fulbright Foreign Student Program",
        "aliases": ["Fulbright Scholarship", "Fulbright"],
        "sponsor": "U.S. Department of State",
        "levels": ["master's", "phd"],
        "destinations": ["United States"],
        "funding": {"coverage": "full", "notes": "Tuition, living stipend, health insurance, and travel."},
        "cycle_months": ["February", "May"],
        "links": [
            {"label": "Official page", "url": "https://foreign.fulbrightonline.org"},
        ],
        "tags": ["USA", "Americas", "full funding", "postgraduate", "government", "cultural exchange"],
        "blurb": "U.S. government scholarship administered per-country via local Fulbright commissions.",
        "description": (
            "The Fulbright Foreign Student Program enables graduate students and professionals from over "
            "160 countries to study and conduct research in the United States. It covers tuition, a living "
            "stipend, health insurance, and travel. Applications are administered per-country via local "
            "Fulbright commissions, binational educational foundations, or U.S. embassies, so deadlines "
            "and eligibility details vary."
        ),
    },
    {
        "id": "oas",
        "category": "program",
        "canonical_name": "OAS Academic Scholarship",
        "aliases": ["OAS Scholarship", "OAS Academic Scholarship"],
        "sponsor": "Organization of American States",
        "levels": ["master's", "phd"],
        "destinations": ["Americas"],
        "funding": {"coverage": "partial", "notes": "Partial tuition support; living costs are the applicant's responsibility."},
        "cycle_months": ["March", "May", "October"],
        "links": [
            {"label": "Official page", "url": "https://www.oas.org/en/scholarships"},
        ],
        "tags": ["Americas", "partial funding", "postgraduate", "OAS"],
        "blurb": "Partial academic scholarships for graduate study among OAS member states.",
        "description": (
            "The Organization of American States (OAS) offers academic scholarships for graduate study or "
            "research in any OAS member state, except the applicant's sponsoring country. Funding is "
            "partial — it contributes toward tuition but living costs remain the applicant's "
            "responsibility. Calls and partner institutions rotate, so confirm the current offer."
        ),
    },
    {
        "id": "canada-graduate-scholarships",
        "category": "program",
        "canonical_name": "Canada Graduate Scholarships",
        "aliases": ["Canadian Government Scholarship", "Canada Graduate Scholarships", "CGS", "Vanier"],
        "sponsor": "Government of Canada",
        "levels": ["master's", "phd"],
        "destinations": ["Canada"],
        "funding": {"coverage": "full", "notes": "Annual stipend; amount and duration vary by award level."},
        "cycle_months": ["October", "November"],
        "links": [
            {"label": "Vanier CGS (doctoral)", "url": "https://vanier.gc.ca"},
            {"label": "SSHRC/NSERC/CIHR programs", "url": "https://www.sshrc-crsh.gc.ca"},
        ],
        "tags": ["Canada", "Americas", "full funding", "postgraduate", "research", "tri-council"],
        "blurb": "Canada's federal graduate scholarship programme, including the Vanier award for doctoral study.",
        "description": (
            "The Canada Graduate Scholarships are the federal government's flagship awards for master's "
            "and doctoral research in Canada, administered by SSHRC, NSERC, and CIHR (the tri-council). "
            "The most prestigious doctoral award is the Vanier Canada Graduate Scholarship, a three-year "
            "stipend awarded for leadership and academic excellence. Applicants apply through their "
            "Canadian university, not directly to the tri-council."
        ),
    },
    {
        "id": "aga-khan-foundation",
        "category": "program",
        "canonical_name": "Aga Khan Foundation Scholarship",
        "aliases": ["Aga Khan Foundation Scholarship"],
        "sponsor": "Aga Khan Foundation",
        "levels": ["master's", "phd"],
        "destinations": ["Global"],
        "funding": {"coverage": "partial", "notes": "Typically split between a grant and a repayable loan."},
        "cycle_months": ["March", "May"],
        "links": [
            {"label": "Official page", "url": "https://the.akdn/en/how-we-work/our-agencies/aga-khan-foundation"},
        ],
        "tags": ["Global", "partial funding", "need-based", "postgraduate", "developing countries"],
        "blurb": "Need-based postgraduate scholarships for students from select developing countries.",
        "description": (
            "The Aga Khan Foundation International Scholarship Programme is a need-based, 50% grant / 50% "
            "loan award for outstanding postgraduate students from select developing countries who have "
            "no other means to finance their studies. Funding is for master's or PhD study at any "
            "reputable university worldwide, including in the applicant's home country. Recipients sign a "
            "moral and legal obligation to repay the loan portion."
        ),
    },
    {
        "id": "jj-wbgsp",
        "category": "program",
        "canonical_name": "Joint Japan World Bank Graduate Scholarship",
        "aliases": ["Joint Japan World Bank Graduate Scholarship", "JJ/WBGSP", "World Bank Scholarship"],
        "sponsor": "World Bank / Government of Japan",
        "levels": ["master's"],
        "destinations": ["Global"],
        "funding": {"coverage": "full", "notes": "Tuition, living stipend, travel, and insurance."},
        "cycle_months": ["March", "April"],
        "links": [
            {"label": "Official page", "url": "https://www.worldbank.org/en/programs/scholarships"},
        ],
        "tags": ["Global", "full funding", "master's", "development", "World Bank", "developing countries"],
        "blurb": "For students from World Bank member developing countries pursuing development-related master's study.",
        "description": (
            "The Joint Japan/World Bank Graduate Scholarship Program (JJ/WBGSP) funds students from World "
            "Bank member developing countries pursuing a master's in a development-related topic at one "
            "of the program's partner universities worldwide. It covers tuition, a living stipend, "
            "round-trip airfare, and health insurance. Applicants must have work experience in "
            "development and commit to returning to their home country after graduation."
        ),
    },
    {
        "id": "opec-fund",
        "category": "program",
        "canonical_name": "OPEC Fund Scholarship",
        "aliases": ["OPEC Fund Scholarship"],
        "sponsor": "OPEC Fund for International Development",
        "levels": ["master's"],
        "destinations": ["Global"],
        "funding": {"coverage": "partial", "notes": "One-time award applied toward tuition and related costs."},
        "cycle_months": ["February", "March"],
        "links": [
            {"label": "Official page", "url": "https://opecfund.org"},
        ],
        "tags": ["Global", "partial funding", "master's", "developing countries"],
        "blurb": "A one-time scholarship award for students from OPEC Fund partner developing countries.",
        "description": (
            "The OPEC Fund Scholarship is a one-time award for high-achieving students from OPEC Fund "
            "partner developing countries pursuing a master's degree at any recognized university "
            "worldwide. It contributes a lump sum toward tuition and related costs and is not a full "
            "scholarship. Confirm the current cycle on the official portal."
        ),
    },
    {
        "id": "schwarzman-scholars",
        "category": "program",
        "canonical_name": "Schwarzman Scholars",
        "aliases": ["Schwarzman Scholars", "Schwarzman Scholarship"],
        "sponsor": "Schwarzman Scholars / Tsinghua University",
        "levels": ["master's"],
        "destinations": ["China"],
        "funding": {"coverage": "full", "notes": "Tuition, room and board, travel, and an in-country stipend."},
        "cycle_months": ["September", "May"],
        "links": [
            {"label": "Official page", "url": "https://www.schwarzmanscholars.org"},
        ],
        "tags": ["China", "Asia", "master's", "full funding", "leadership", "global affairs"],
        "blurb": "A one-year fully funded master's in global affairs at Tsinghua University, Beijing.",
        "description": (
            "Schwarzman Scholars is a one-year fully funded master's in global affairs at Tsinghua "
            "University in Beijing, designed to build a community of future leaders who will deepen "
            "understanding between China and the rest of the world. The scholarship covers tuition, room "
            "and board, travel to and from Beijing, and an in-country study-travel stipend. Admission is "
            "highly competitive and open to applicants of any nationality."
        ),
    },
    {
        "id": "ofid-scholarship",
        "category": "program",
        "canonical_name": "OFID (OPEC) Scholarship",
        "aliases": ["OFID Scholarship"],
        "sponsor": "OPEC Fund (formerly OFID)",
        "levels": ["master's"],
        "destinations": ["Global"],
        "funding": {"coverage": "partial", "notes": "One-time award toward tuition and living costs."},
        "cycle_months": ["May"],
        "links": [
            {"label": "Official page", "url": "https://opecfund.org"},
        ],
        "tags": ["Global", "partial funding", "master's"],
        "blurb": "A one-time award from the OPEC Fund for master's students from developing countries.",
        "description": (
            "OFID (now the OPEC Fund) awards a one-time scholarship to a high-achieving student from a "
            "developing country pursuing a master's degree at any recognized university worldwide. The "
            "award is a lump sum toward tuition and living costs and is not a full scholarship."
        ),
    },

    # ── University-specific scholarships ────────────────────────────────────
    {
        "id": "gates-cambridge",
        "category": "university",
        "canonical_name": "Gates Cambridge Scholarship",
        "aliases": ["Gates Cambridge Scholarship"],
        "sponsor": "Bill & Melinda Gates Foundation / University of Cambridge",
        "levels": ["master's", "phd"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition, maintenance allowance, and additional discretionary grants."},
        "cycle_months": ["October", "December"],
        "links": [
            {"label": "Official page", "url": "https://www.gatescambridge.org"},
            {"label": "Apply", "url": "https://www.gatescambridge.org/apply/"},
        ],
        "tags": ["UK", "Europe", "Cambridge", "full funding", "postgraduate", "leadership", "merit"],
        "blurb": "Fully funded scholarship for postgraduate study at the University of Cambridge.",
        "description": (
            "Gates Cambridge is a fully funded postgraduate scholarship at the University of Cambridge, "
            "funded by the Bill & Melinda Gates Foundation. It is awarded on outstanding academic "
            "ability, leadership potential, and a commitment to improving the lives of others. It covers "
            "full tuition, a maintenance allowance, and discretionary grants for family and fieldwork. "
            "Open to applicants of any nationality applying for any full-time postgraduate degree at "
            "Cambridge."
        ),
    },
    {
        "id": "rhodes",
        "category": "university",
        "canonical_name": "Rhodes Scholarship",
        "aliases": ["Rhodes Scholarship"],
        "sponsor": "Rhodes Trust / University of Oxford",
        "levels": ["master's"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition, stipend, and travel; deadlines vary by constituency/country."},
        "cycle_months": ["July", "October"],
        "links": [
            {"label": "Official page", "url": "https://www.rhodeshouse.ox.ac.uk"},
            {"label": "Find your constituency", "url": "https://www.rhodeshouse.ox.ac.uk/scholarships/"},
        ],
        "tags": ["UK", "Europe", "Oxford", "full funding", "master's", "leadership", "merit"],
        "blurb": "One of the oldest international postgraduate scholarships, funding study at Oxford.",
        "description": (
            "The Rhodes Scholarship is one of the world's oldest international postgraduate awards, "
            "funding study at the University of Oxford. It covers full tuition, a generous stipend, and "
            "travel. Selection is by constituency (country or region), each with its own eligibility "
            "rules and deadlines. Selection criteria are academic excellence, energy to use talents to "
            "the full, moral force of character, and the instinct to lead."
        ),
    },
    {
        "id": "clarendon-fund",
        "category": "university",
        "canonical_name": "Clarendon Fund",
        "aliases": ["Clarendon Fund", "Clarendon Scholarship"],
        "sponsor": "University of Oxford",
        "levels": ["master's", "phd"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition and a generous annual stipend."},
        "cycle_months": ["December", "January"],
        "links": [
            {"label": "Official page", "url": "https://www.ox.ac.uk/admissions/graduate/fees-and-funding/funding/clarendon"},
            {"label": "Application timeline", "url": "https://www.ox.ac.uk/admissions/graduate/fees-and-funding/funding/clarendon/applicants/timeline"},
        ],
        "tags": ["UK", "Europe", "Oxford", "full funding", "postgraduate", "merit"],
        "blurb": "Oxford's flagship graduate scholarship, fully funded by the university.",
        "description": (
            "The Clarendon Fund is the University of Oxford's flagship graduate scholarship scheme, "
            "fully funded by Oxford University Press and Oxford's colleges. Clarendon Scholarships cover "
            "full tuition and an annual stipend for the duration of a graduate (master's or doctoral) "
            "degree. All applicants who apply by the December graduate deadline are automatically "
            "considered — there is no separate application. Selection is purely on academic merit and "
            "potential."
        ),
    },
    {
        "id": "knight-hennessy",
        "category": "university",
        "canonical_name": "Knight-Hennessy Scholars",
        "aliases": ["Knight-Hennessy Scholars", "Knight Hennessy", "KHS"],
        "sponsor": "Stanford University (Phil Knight gift)",
        "levels": ["master's", "phd"],
        "destinations": ["United States"],
        "funding": {"coverage": "full", "notes": "Tuition, stipend, and an annual travel allowance for up to 3 years."},
        "cycle_months": ["September", "October"],
        "links": [
            {"label": "Official page", "url": "https://knight-hennessy.stanford.edu"},
            {"label": "Application deadlines", "url": "https://knight-hennessy.stanford.edu/admission/preparing-your-applications/application-deadlines"},
        ],
        "tags": ["USA", "Americas", "Stanford", "full funding", "postgraduate", "leadership"],
        "blurb": "Stanford's fully funded graduate leadership program across all seven schools.",
        "description": (
            "Knight-Hennessy Scholars is Stanford University's flagship graduate scholarship program, "
            "designed to build a multidisciplinary community of future global leaders. Scholars pursue "
            "any full-time graduate degree across Stanford's seven schools (business, education, "
            "engineering, humanities and sciences, law, medicine, sustainability). Funding includes "
            "tuition, a living and academic stipend, and an annual travel allowance for up to three "
            "years. Open to applicants of any nationality."
        ),
    },
    {
        "id": "mitchell-scholarship",
        "category": "university",
        "canonical_name": "US-Ireland Alliance Scholarship (Mitchell)",
        "aliases": ["Mitchell Scholarship", "George J. Mitchell Scholarship", "US-Ireland Alliance Scholarship"],
        "sponsor": "US-Ireland Alliance / Government of Ireland",
        "levels": ["master's"],
        "destinations": ["Ireland"],
        "funding": {"coverage": "full", "notes": "Tuition, housing, living stipend, and international travel."},
        "cycle_months": ["September", "October"],
        "links": [
            {"label": "Official page", "url": "https://us-irelandalliance.org/mitchellscholarship"},
            {"label": "Eligibility", "url": "https://us-irelandalliance.org/mitchellscholarship/applicants/eligibility"},
        ],
        "tags": ["Ireland", "Europe", "full funding", "master's", "leadership", "US-only"],
        "blurb": "A one-year fully funded master's scholarship at Irish universities for US students (currently paused).",
        "description": (
            "The US-Ireland Alliance Scholarship (formerly the George J. Mitchell Scholarship) is a "
            "competitive, one-year fully funded master's scholarship for US citizens to study at any "
            "recognized institution of higher learning in Ireland and Northern Ireland. Funding covers "
            "tuition, housing, a living stipend, and international travel. Note: selections have been "
            "paused for the 2024 and 2025 application seasons — confirm current status on the official "
            "site before planning an application."
        ),
    },
    {
        "id": "marshall-scholarship",
        "category": "university",
        "canonical_name": "Marshall Scholarship",
        "aliases": ["Marshall Scholarship"],
        "sponsor": "UK Government (FCDO) for US students",
        "levels": ["master's", "phd"],
        "destinations": ["United Kingdom"],
        "funding": {"coverage": "full", "notes": "Tuition, living stipend, travel, and thesis grants."},
        "cycle_months": ["September", "October"],
        "links": [
            {"label": "Official page", "url": "https://www.marshallscholarship.org"},
        ],
        "tags": ["UK", "Europe", "full funding", "postgraduate", "US-only", "merit"],
        "blurb": "Fully funded postgraduate study in the UK for high-achieving US students.",
        "description": (
            "The Marshall Scholarship funds high-achieving US students for one or two years (extendable "
            "to three for a PhD) of postgraduate study at any UK university. It covers full tuition, a "
            "living stipend, travel, and thesis grants. It was established as a gesture of gratitude to "
            "the US for the Marshall Plan. Selection is on academic merit, leadership potential, and the "
            "ambition to serve as a US-UK bridge."
        ),
    },
    {
        "id": "mitchell-notre-dame",
        "category": "university",
        "canonical_name": "Notre Dame Hesburgh-Yusko Scholarships",
        "aliases": ["Hesburgh-Yusko Scholarship"],
        "sponsor": "University of Notre Dame",
        "levels": ["bachelor's"],
        "destinations": ["United States"],
        "funding": {"coverage": "full", "notes": "Full tuition for an undergraduate degree at Notre Dame."},
        "cycle_months": ["November", "January"],
        "links": [
            {"label": "Official page", "url": "https://financialaid.nd.edu"},
        ],
        "tags": ["USA", "Americas", "undergraduate", "Notre Dame", "merit"],
        "blurb": "Merit-based full undergraduate tuition at the University of Notre Dame.",
        "description": (
            "The University of Notre Dame offers merit-based full-tuition scholarships for "
            "undergraduates, including the Hesburgh-Yusko Scholars Program. These awards are highly "
            "competitive and combine full tuition with enrichment funding for leadership development, "
            "research, and service. Confirm exact eligibility on the financial aid page."
        ),
    },
    {
        "id": "yale-young-global-scholars",
        "category": "university",
        "canonical_name": "Yale Young Global Scholars",
        "aliases": ["YYGS", "Yale Young Global Scholars"],
        "sponsor": "Yale University",
        "levels": ["short course"],
        "destinations": ["United States"],
        "funding": {"coverage": "partial", "notes": "Need-based financial aid toward program tuition."},
        "cycle_months": ["January", "February"],
        "links": [
            {"label": "Official page", "url": "https://globalscholars.yale.edu"},
        ],
        "tags": ["USA", "Americas", "Yale", "pre-college", "leadership", "short course"],
        "blurb": "A Yale summer program for high-school students with need-based aid.",
        "description": (
            "Yale Young Global Scholars (YYGS) is an academic summer program at Yale University for "
            "outstanding high-school students from around the world. It offers multidisciplinary tracks "
            "and provides need-based financial aid that can cover up to full tuition for admitted "
            "students. It is not a degree scholarship, but is a recognized pathway into the Yale and US "
            "academic network."
        ),
    },
    {
        "id": "mit-presidential-fellowship",
        "category": "university",
        "canonical_name": "MIT Presidential Fellowship",
        "aliases": ["MIT Presidential Fellowship"],
        "sponsor": "Massachusetts Institute of Technology",
        "levels": ["phd"],
        "destinations": ["United States"],
        "funding": {"coverage": "full", "notes": "First-year tuition plus stipend for incoming PhD students."},
        "cycle_months": ["December", "January"],
        "links": [
            {"label": "Official page", "url": "https://oge.mit.edu/fellowships/presidential-graduate-fellowship-program/"},
        ],
        "tags": ["USA", "Americas", "MIT", "PhD", "full funding", "research", "STEM"],
        "blurb": "MIT's first-year PhD fellowship, supporting exceptional incoming doctoral students.",
        "description": (
            "The MIT Presidential Fellowship is the institute's flagship award for incoming PhD students. "
            "It provides first-year tuition and a stipend, and is typically combined with departmental "
            "funding for subsequent years. Recipients are nominated by their admitting department, so "
            "applicants do not apply directly — they apply to the PhD program by its December or January "
            "deadline."
        ),
    },
    {
        "id": "princeton-fellowship",
        "category": "university",
        "canonical_name": "Princeton Graduate Fellowship",
        "aliases": ["Princeton Fellowship"],
        "sponsor": "Princeton University",
        "levels": ["phd"],
        "destinations": ["United States"],
        "funding": {"coverage": "full", "notes": "Full tuition plus stipend for the duration of a PhD."},
        "cycle_months": ["December"],
        "links": [
            {"label": "Graduate funding", "url": "https://gradschool.princeton.edu/financial-support"},
        ],
        "tags": ["USA", "Americas", "Princeton", "PhD", "full funding", "research"],
        "blurb": "Fully funded PhD places at Princeton across the natural sciences, social sciences, and humanities.",
        "description": (
            "Princeton University funds all admitted doctoral students for the duration of their "
            "program, through a combination of fellowships, assistantships, and external awards. Funding "
            "covers full tuition and a stipend. Princeton is notable for its policy of funding every "
            "admitted PhD student, making it one of the most reliable sources of fully funded doctoral "
            "study in the US."
        ),
    },
    {
        "id": "harvard-gsas",
        "category": "university",
        "canonical_name": "Harvard GSAS Funding",
        "aliases": ["Harvard Graduate Funding", "GSAS"],
        "sponsor": "Harvard University (Graduate School of Arts and Sciences)",
        "levels": ["phd"],
        "destinations": ["United States"],
        "funding": {"coverage": "full", "notes": "Full tuition plus stipend for at least five years of PhD study."},
        "cycle_months": ["December", "January"],
        "links": [
            {"label": "Graduate funding", "url": "https://gsas.harvard.edu/financial-support"},
        ],
        "tags": ["USA", "Americas", "Harvard", "PhD", "full funding", "research"],
        "blurb": "Harvard's guaranteed five-year PhD funding package across GSAS departments.",
        "description": (
            "Harvard's Graduate School of Arts and Sciences (GSAS) guarantees full financial support — "
            "tuition plus a stipend — for all admitted doctoral students for at least the first five "
            "years, through a combination of grants, teaching fellowships, and research assistantships. "
            "This is part of why Harvard is among the most sought-after destinations for fully funded "
            "doctoral study in the US."
        ),
    },
    {
        "id": "eth-excellence",
        "category": "university",
        "canonical_name": "ETH Zurich Excellence Scholarship",
        "aliases": ["ETH Excellence Scholarship", "ETH Excellence Award"],
        "sponsor": "ETH Zurich",
        "levels": ["master's"],
        "destinations": ["Switzerland"],
        "funding": {"coverage": "full", "notes": "Tuition plus a stipend and, in the Excellence Award, a study allowance."},
        "cycle_months": ["December", "March"],
        "links": [
            {"label": "Official page", "url": "https://ethz.ch/studies/financial/tuition-fees-and-financial-aid/scholarships/excellence-scholarship-opportunity-programme-esop.html"},
        ],
        "tags": ["Switzerland", "Europe", "ETH", "master's", "full funding", "STEM", "merit"],
        "blurb": "ETH Zurich's fully funded master's award for the best incoming students.",
        "description": (
            "The ETH Zurich Excellence Scholarship & Opportunity Programme (ESOP) is ETH's flagship "
            "master's scholarship for the most academically outstanding incoming students. It covers full "
            "tuition and provides a generous living-cost stipend for the two-year master's program. "
            "Admission is competitive and based on a separate scholarship application submitted alongside "
            "the master's application."
        ),
    },
    {
        "id": "epfl-doctoral",
        "category": "university",
        "canonical_name": "EPFL Doctoral Program",
        "aliases": ["EPFL Doctoral", "EPFL PhD"],
        "sponsor": "École Polytechnique Fédérale de Lausanne (EPFL)",
        "levels": ["phd"],
        "destinations": ["Switzerland"],
        "funding": {"coverage": "full", "notes": "Annual doctoral salary for the duration of the PhD program."},
        "cycle_months": ["January", "September"],
        "links": [
            {"label": "Doctoral school", "url": "https://www.epfl.ch/education/phd/"},
        ],
        "tags": ["Switzerland", "Europe", "EPFL", "PhD", "full funding", "STEM", "salary"],
        "blurb": "Fully funded doctoral positions at EPFL, paid as university staff.",
        "description": (
            "EPFL (École Polytechnique Fédérale de Lausanne) hires its PhD students as employees, which "
            "means doctoral candidates receive a competitive annual salary rather than a stipend for the "
            "duration of their program. Admission is by direct application to an open PhD position in a "
            "laboratory, and applicants should browse the EPFL doctoral school listings to find a fit."
        ),
    },
    {
        "id": "eth-doctoral",
        "category": "university",
        "canonical_name": "ETH Zurich Doctoral Positions",
        "aliases": ["ETH Doctoral", "ETH PhD"],
        "sponsor": "ETH Zurich",
        "levels": ["phd"],
        "destinations": ["Switzerland"],
        "funding": {"coverage": "full", "notes": "Doctoral assistant salary for the duration of the PhD."},
        "cycle_months": ["January", "September"],
        "links": [
            {"label": "Open positions", "url": "https://jobs.ethz.ch"},
        ],
        "tags": ["Switzerland", "Europe", "ETH", "PhD", "full funding", "STEM", "salary"],
        "blurb": "Fully funded doctoral positions at ETH Zurich, paid as scientific assistant staff.",
        "description": (
            "ETH Zurich funds its doctoral students as scientific assistants, which means PhD candidates "
            "receive a competitive annual salary for the duration of their program. Admission is by direct "
            "application to an open position in a research group, listed on the ETH jobs portal."
        ),
    },
    {
        "id": "uoft-pearson",
        "category": "university",
        "canonical_name": "Lester B. Pearson International Scholarship",
        "aliases": ["Pearson Scholarship", "Lester B. Pearson"],
        "sponsor": "University of Toronto",
        "levels": ["bachelor's"],
        "destinations": ["Canada"],
        "funding": {"coverage": "full", "notes": "Tuition, books, incidental fees, and residence support for 4 years."},
        "cycle_months": ["September", "January"],
        "links": [
            {"label": "Official page", "url": "https://future.utoronto.ca/pearson"},
        ],
        "tags": ["Canada", "Americas", "UofT", "undergraduate", "full funding", "leadership", "international"],
        "blurb": "University of Toronto's fully funded undergraduate scholarship for international students.",
        "description": (
            "The Lester B. Pearson International Scholarship at the University of Toronto is a fully "
            "funded four-year undergraduate scholarship for exceptional international students. It covers "
            "tuition, books, incidental fees, and residence support. Applicants must be nominated by "
            "their high school and demonstrate exceptional academic achievement and creativity, as well "
            "as status as an international student."
        ),
    },
    {
        "id": "ubc-killam",
        "category": "university",
        "canonical_name": "UBC Killam Doctoral Scholarship",
        "aliases": ["Killam Doctoral", "UBC Killam"],
        "sponsor": "University of British Columbia (Killam Trusts)",
        "levels": ["phd"],
        "destinations": ["Canada"],
        "funding": {"coverage": "full", "notes": "Annual stipend plus a research travel allowance."},
        "cycle_months": ["November"],
        "links": [
            {"label": "Official page", "url": "https://www.grad.ubc.ca/awards/affiliated-fellowships-doctoral-program"},
        ],
        "tags": ["Canada", "Americas", "UBC", "PhD", "full funding", "research"],
        "blurb": "UBC's most prestigious doctoral award, funded by the Killam Trusts.",
        "description": (
            "The UBC Killam Doctoral Scholarship is the University of British Columbia's most "
            "prestigious award for incoming doctoral students, funded by the Killam Trusts. It provides "
            "an annual stipend for two years plus a research and travel allowance. Recipients are "
            "nominated by their admitting department on the basis of academic excellence, research "
            "potential, and leadership."
        ),
    },
    {
        "id": "ubc-four-year-doctoral",
        "category": "university",
        "canonical_name": "UBC Four-Year Doctoral Fellowship",
        "aliases": ["4YF", "UBC 4YF"],
        "sponsor": "University of British Columbia",
        "levels": ["phd"],
        "destinations": ["Canada"],
        "funding": {"coverage": "full", "notes": "Tuition plus an annual stipend for the first four years of a PhD."},
        "cycle_months": ["December", "January"],
        "links": [
            {"label": "Official page", "url": "https://www.grad.ubc.ca/awards/four-year-doctoral-fellowship-4yf"},
        ],
        "tags": ["Canada", "Americas", "UBC", "PhD", "full funding", "research"],
        "blurb": "UBC's guaranteed four-year funding package for incoming PhD students.",
        "description": (
            "The UBC Four-Year Doctoral Fellowship (4YF) program provides full tuition plus a stipend "
            "for the first four years of doctoral study at the University of British Columbia. It is "
            "designed to ensure that all admitted doctoral students have reliable funding while they "
            "focus on research. Allocation is managed by admitting departments."
        ),
    },
    {
        "id": "nus-research-scholarship",
        "category": "university",
        "canonical_name": "NUS Research Scholarship",
        "aliases": ["NUS Research Scholarship", "NUS PhD"],
        "sponsor": "National University of Singapore",
        "levels": ["phd"],
        "destinations": ["Singapore"],
        "funding": {"coverage": "full", "notes": "Tuition plus a monthly stipend for the duration of the PhD."},
        "cycle_months": ["January", "August"],
        "links": [
            {"label": "Graduate admissions", "url": "https://nusgs.nus.edu.sg"},
        ],
        "tags": ["Singapore", "Asia", "NUS", "PhD", "full funding", "research", "STEM"],
        "blurb": "Fully funded PhD places at the National University of Singapore.",
        "description": (
            "The National University of Singapore (NUS) funds its doctoral students through the NUS "
            "Research Scholarship, which covers full tuition and a monthly stipend for up to four years. "
            "PhD applicants are automatically considered when they apply to a program. More prestigious "
            "variants (the NUS President's Graduate Fellowship, the SMART Graduate Fellowship) may top up "
            "the standard stipend."
        ),
    },
    {
        "id": "ntu-npgs",
        "category": "university",
        "canonical_name": "NTU Nanyang President's Graduate Scholarship",
        "aliases": ["NPGS", "NTU NPGS"],
        "sponsor": "Nanyang Technological University",
        "levels": ["phd"],
        "destinations": ["Singapore"],
        "funding": {"coverage": "full", "notes": "Tuition plus an enhanced monthly stipend for up to 4 years."},
        "cycle_months": ["January", "August"],
        "links": [
            {"label": "Official page", "url": "https://www.ntu.edu.sg/admissions/graduate/financialmatters/scholarships/npgs"},
        ],
        "tags": ["Singapore", "Asia", "NTU", "PhD", "full funding", "research", "STEM"],
        "blurb": "NTU's prestigious fully funded PhD scholarship for top incoming doctoral students.",
        "description": (
            "The Nanyang President's Graduate Scholarship (NPGS) is Nanyang Technological University's "
            "flagship doctoral award for outstanding incoming PhD students. It covers full tuition and an "
            "enhanced monthly stipend for up to four years, and is awarded on academic excellence, "
            "research potential, and leadership. Applicants are nominated by their admitting school."
        ),
    },
    {
        "id": "unimelb-graduate-research",
        "category": "university",
        "canonical_name": "University of Melbourne Graduate Research Scholarship",
        "aliases": ["Melbourne GR Scholarship", "Melbourne PhD"],
        "sponsor": "University of Melbourne",
        "levels": ["phd", "postdoctoral"],
        "destinations": ["Australia"],
        "funding": {"coverage": "full", "notes": "Tuition plus a stipend for up to 3.5 years."},
        "cycle_months": ["January", "July"],
        "links": [
            {"label": "Official page", "url": "https://scholarships.unimelb.edu.au/awards/graduate-research-scholarships"},
        ],
        "tags": ["Australia", "Oceania", "Melbourne", "PhD", "full funding", "research"],
        "blurb": "Fully funded PhD places at the University of Melbourne for domestic and international students.",
        "description": (
            "The University of Melbourne Graduate Research Scholarship covers full tuition and a living "
            "stipend for up to 3.5 years of doctoral research, available to both domestic and "
            "international applicants. It is the university's main scholarship for incoming PhD students, "
            "and applicants are automatically considered when they apply for graduate research."
        ),
    },
    {
        "id": "anu-research",
        "category": "university",
        "canonical_name": "ANU PhD Scholarship",
        "aliases": ["ANU PhD", "ANU Research"],
        "sponsor": "Australian National University",
        "levels": ["phd"],
        "destinations": ["Australia"],
        "funding": {"coverage": "full", "notes": "Tuition (international) plus a stipend for up to 3 years."},
        "cycle_months": ["January", "July"],
        "links": [
            {"label": "Graduate research", "url": "https://study.anu.edu.au/scholarships/find-scholarship/anu-phd-scholarship"},
        ],
        "tags": ["Australia", "Oceania", "ANU", "PhD", "full funding", "research"],
        "blurb": "Fully funded PhD places at the Australian National University.",
        "description": (
            "Australian National University (ANU) offers a range of fully funded PhD scholarships for "
            "domestic and international students. These cover full tuition (where applicable) plus a "
            "tax-free stipend for up to three years. ANU is consistently the highest-ranked Australian "
            "university and a major destination for STEM and policy research."
        ),
    },
    {
        "id": "kaist-scholarship",
        "category": "university",
        "canonical_name": "KAIST Scholarship",
        "aliases": ["KAIST Scholarship", "KAIST"],
        "sponsor": "Korea Advanced Institute of Science and Technology",
        "levels": ["bachelor's", "master's", "phd"],
        "destinations": ["South Korea"],
        "funding": {"coverage": "full", "notes": "Tuition plus a monthly stipend; coverage varies by program/level."},
        "cycle_months": ["March", "September"],
        "links": [
            {"label": "Admissions", "url": "https://admission.kaist.ac.kr"},
        ],
        "tags": ["South Korea", "Asia", "KAIST", "full funding", "STEM", "all levels"],
        "blurb": "KAIST's fully funded scholarships for international students across all degree levels.",
        "description": (
            "KAIST (Korea Advanced Institute of Science and Technology) is South Korea's leading "
            "research-focused university for science and engineering, and offers generous fully funded "
            "scholarships to international students at the undergraduate and graduate levels. Coverage "
            "typically includes full tuition and a monthly stipend. KAIST is highly competitive, "
            "particularly in engineering and computer science."
        ),
    },
]

