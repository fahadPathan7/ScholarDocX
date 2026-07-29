import { useState } from "react";
import {
  Microscope,
  Compass,
  Gamepad2,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  FileText,
  Mail,
  Trophy,
  Brain,
  Zap,
  Target,
  BookOpen,
  Award,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useReveal } from "./useReveal";
import "./PillarsShowcase.css";

type PillarId = "research" | "advisor" | "games";

interface Pillar {
  id: PillarId;
  badge: string;
  title: string;
  tagline: string;
  description: string;
  icon: typeof Microscope;
  accentClass: string;
  features: string[];
}

const PILLARS: Pillar[] = [
  {
    id: "research",
    badge: "Paper & Document Intelligence",
    title: "Research Expert",
    tagline: "Deep AI-assisted paper analysis & proposal refinement",
    description:
      "Upload academic papers or research drafts for deep AI analysis. Get instant summaries, methodology breakdowns, key contribution extraction, and critique prompts to sharpen your statement of purpose.",
    icon: Microscope,
    accentClass: "accent-cyan",
    features: [
      "Full-text reading & section analysis",
      "Predefined prompt suites for quick paper critiques",
      "Extract methodology & research gaps automatically",
      "Align your research proposal with current literature",
    ],
  },
  {
    id: "advisor",
    badge: "Faculty Vetting & Discovery",
    title: "Advisor Atlas",
    tagline: "AI-driven research-fit scoring & verified contact details",
    description:
      "Discover prospective graduate advisors matched to your exact research interests. Access AI-calculated research-fit scores, recent publication topics, verified email contacts, and active recruiting signals.",
    icon: Compass,
    accentClass: "accent-emerald",
    features: [
      "AI-driven research alignment & fit scoring",
      "Verified professor email contacts & lab links",
      "Recruiting status signals for Fall 2026 intake",
      "One-click integration with Cold Email Logger",
    ],
  },
  {
    id: "games",
    badge: "Cognitive Micro-Breaks",
    title: "Focus Games",
    tagline: "6 built-in mental recharge games to prevent applicant burnout",
    description:
      "Graduate application seasons are demanding. Take quick, productive cognitive micro-breaks with 6 workspace-embedded brain games (2048, Sudoku, Pattern Memory, Minesweeper, Word Puzzle, and TicTacToe).",
    icon: Gamepad2,
    accentClass: "accent-amber",
    features: [
      "6 engaging games built directly into the workspace",
      "Designed for quick 2 to 5 minute focus refreshers",
      "Track focus scores & personal best achievements",
      "Zero external distracions — stays 100% inside your portal",
    ],
  },
];

export function PillarsShowcase() {
  const [activeTab, setActiveTab] = useState<PillarId>("research");
  const headerRef = useReveal<HTMLDivElement>();
  const cardRef = useReveal<HTMLDivElement>();

  const currentPillar = PILLARS.find((p) => p.id === activeTab) || PILLARS[0];

  return (
    <section id="featured-tools" className="lp-pillars-section">
      <div className="lp-pillars-ambient-glow" />

      {/* Header */}
      <div className="reveal text-center" ref={headerRef}>
        <div className="lp-pillars-tag">
          <Sparkles size={14} />
          <span>Market-Leading Power Tools</span>
        </div>
        <h2 className="lp-section-title">
          Three Pillars Engineered for Scholar Excellence
        </h2>
        <p className="lp-section-subtitle">
          Research deeper, vet prospective advisors smarter, and maintain peak mental focus throughout your application journey.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="lp-pillars-nav">
        {PILLARS.map((p) => {
          const Icon = p.icon;
          const isActive = activeTab === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={`lp-pillar-nav-btn ${p.accentClass} ${isActive ? "is-active" : ""}`}
              onClick={() => setActiveTab(p.id)}
            >
              <div className="lp-pillar-nav-icon">
                <Icon size={20} />
              </div>
              <div className="lp-pillar-nav-text">
                <span className="lp-pillar-nav-title">{p.title}</span>
                <span className="lp-pillar-nav-badge">{p.badge}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Interactive Stage */}
      <div className="reveal" ref={cardRef}>
        <div className={`lp-pillar-stage ${currentPillar.accentClass}`}>
          {/* Left Column: Descriptions & Bullet Features */}
          <div className="lp-pillar-info">
            <div className="lp-pillar-badge-chip">
              <currentPillar.icon size={15} />
              <span>{currentPillar.badge}</span>
            </div>

            <h3 className="lp-pillar-headline">{currentPillar.title}</h3>
            <p className="lp-pillar-subtag">{currentPillar.tagline}</p>
            <p className="lp-pillar-desc">{currentPillar.description}</p>

            <ul className="lp-pillar-checklist">
              {currentPillar.features.map((feat) => (
                <li key={feat}>
                  <CheckCircle2 size={16} className="lp-pillar-check-icon" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>

            <div className="lp-pillar-cta-row">
              <Link to="/register" className="lp-pillar-btn-primary">
                Try {currentPillar.title} Now
                <ArrowRight size={16} />
              </Link>
              <span className="lp-pillar-cta-note">Included in free tier</span>
            </div>
          </div>

          {/* Right Column: Live Interactive Simulated UI Preview */}
          <div className="lp-pillar-preview-col">
            {activeTab === "research" && <ResearchExpertPreview />}
            {activeTab === "advisor" && <AdvisorAtlasPreview />}
            {activeTab === "games" && <FocusGamesPreview />}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Simulated Live Mockup for Research Expert */
function ResearchExpertPreview() {
  const [selectedPrompt, setSelectedPrompt] = useState<string>("methodology");

  return (
    <div className="lp-mock-card mock-research">
      <div className="lp-mock-header">
        <div className="lp-mock-dots">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <div className="lp-mock-title">
          <FileText size={13} />
          Quantum_Graph_Neural_Networks_2025.pdf
        </div>
        <span className="lp-mock-status-pill cyan">Paper Loaded</span>
      </div>

      <div className="lp-mock-body">
        {/* Paper Header Info */}
        <div className="lp-mock-paper-meta">
          <div>
            <h4 className="lp-paper-title">Quantum Message-Passing Neural Networks for Molecular Property Prediction</h4>
            <p className="lp-paper-authors">Dr. A. Chen, Prof. M. Vance · Nature Computational Science (2025)</p>
          </div>
          <div className="lp-match-badge cyan">
            <span className="score">96%</span>
            <span className="lbl">Relevance</span>
          </div>
        </div>

        {/* Predefined Analytical Prompt Selector */}
        <div className="lp-prompt-selector">
          <span className="lp-prompt-label">AI Analytical Prompts:</span>
          <div className="lp-prompt-chips">
            <button
              type="button"
              className={`lp-prompt-chip ${selectedPrompt === "methodology" ? "active" : ""}`}
              onClick={() => setSelectedPrompt("methodology")}
            >
              Methodology
            </button>
            <button
              type="button"
              className={`lp-prompt-chip ${selectedPrompt === "contributions" ? "active" : ""}`}
              onClick={() => setSelectedPrompt("contributions")}
            >
              Key Contributions
            </button>
            <button
              type="button"
              className={`lp-prompt-chip ${selectedPrompt === "gaps" ? "active" : ""}`}
              onClick={() => setSelectedPrompt("gaps")}
            >
              Research Gaps
            </button>
          </div>
        </div>

        {/* Output Box */}
        <div className="lp-analysis-box">
          <div className="lp-analysis-title">
            <Sparkles size={14} className="cyan-text" />
            <span>AI Analytical Insight</span>
          </div>

          {selectedPrompt === "methodology" && (
            <p className="lp-analysis-text">
              "The authors propose a dual-qubit message-passing mechanism that scales quadratically faster than standard MPNNs. Section 4 introduces Hamiltonian embedding layers suitable for ligand binding tasks."
            </p>
          )}

          {selectedPrompt === "contributions" && (
            <p className="lp-analysis-text">
              "1. First 10,000-conformer benchmark dataset for quantum molecular representations. 2. 34% reduction in prediction error on QM9 datasets compared to baseline GNNs."
            </p>
          )}

          {selectedPrompt === "gaps" && (
            <p className="lp-analysis-text">
              "Future work requires testing on macrocyclic structures. Excellent opportunity to position your Statement of Purpose around expanding this framework to multi-chain proteins!"
            </p>
          )}
        </div>

        <div className="lp-mock-footer">
          <span className="lp-footer-tag">
            <BookOpen size={13} /> Full-text reading & section analysis
          </span>
          <span className="lp-action-badge">Refine Proposal</span>
        </div>
      </div>
    </div>
  );
}

/** Simulated Live Mockup for Advisor Atlas */
function AdvisorAtlasPreview() {
  const [emailed, setEmailed] = useState(false);

  return (
    <div className="lp-mock-card mock-advisor">
      <div className="lp-mock-header">
        <div className="lp-mock-dots">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <div className="lp-mock-title">
          <Compass size={13} />
          Advisor Atlas Match Profile
        </div>
        <span className="lp-mock-status-pill emerald">Recruiting Fall 2026</span>
      </div>

      <div className="lp-mock-body">
        {/* Professor Profile Header */}
        <div className="lp-prof-card">
          <div className="lp-prof-avatar">ER</div>
          <div className="lp-prof-details">
            <h4 className="lp-prof-name">Prof. Elena Rostova, Ph.D.</h4>
            <p className="lp-prof-dept">Associate Professor · Stanford AI Lab (SAIL)</p>
            <p className="lp-prof-tags">
              <span>Machine Learning</span>
              <span>Computational Bio</span>
              <span>Drug Discovery</span>
            </p>
          </div>
          <div className="lp-match-badge emerald">
            <span className="score">98%</span>
            <span className="lbl">Fit Score</span>
          </div>
        </div>

        {/* Fit Matrix */}
        <div className="lp-fit-breakdown">
          <div className="lp-fit-row">
            <span className="fit-lbl">Research Overlap</span>
            <div className="fit-bar-track">
              <div className="fit-bar-fill emerald" style={{ width: "95%" }} />
            </div>
            <span className="fit-val">95%</span>
          </div>
          <div className="lp-fit-row">
            <span className="fit-lbl">Recent Publication Recency</span>
            <div className="fit-bar-track">
              <div className="fit-bar-fill emerald" style={{ width: "100%" }} />
            </div>
            <span className="fit-val">2025</span>
          </div>
        </div>

        {/* Recent Work */}
        <div className="lp-recent-work">
          <span className="lp-work-label">Latest Lab Paper:</span>
          <p className="lp-work-title">"Generative Molecular Transformers for Target-Specific Inhibitors"</p>
        </div>

        <div className="lp-mock-footer">
          <div className="lp-verified-email">
            <Mail size={13} className="emerald-text" />
            <span>erostova@stanford.edu (Verified)</span>
          </div>

          <button
            type="button"
            className={`lp-email-action-btn ${emailed ? "done" : ""}`}
            onClick={() => setEmailed(!emailed)}
          >
            {emailed ? (
              <>
                <CheckCircle2 size={13} />
                Outreach Drafted
              </>
            ) : (
              <>
                <Zap size={13} />
                Draft Outreach
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Simulated Live Mockup for Focus Games */
function FocusGamesPreview() {
  const [selectedGame, setSelectedGame] = useState<string>("2048");

  return (
    <div className="lp-mock-card mock-games">
      <div className="lp-mock-header">
        <div className="lp-mock-dots">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
        </div>
        <div className="lp-mock-title">
          <Gamepad2 size={13} />
          Workspace Brain Games (6 Games)
        </div>
        <span className="lp-mock-status-pill amber">Mental Recharge</span>
      </div>

      <div className="lp-mock-body">
        {/* Game Selector Chips */}
        <div className="lp-game-selector">
          {["2048", "Sudoku", "Pattern Memory", "Word Puzzle", "Minesweeper"].map((g) => (
            <button
              key={g}
              type="button"
              className={`lp-game-chip ${selectedGame === g ? "active" : ""}`}
              onClick={() => setSelectedGame(g)}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Live Mini Game Display Area */}
        <div className="lp-game-display">
          {selectedGame === "2048" && (
            <div className="lp-mini-2048">
              <div className="tile t2">2</div>
              <div className="tile t4">4</div>
              <div className="tile t8">8</div>
              <div className="tile t16">16</div>
              <div className="tile t64">64</div>
              <div className="tile t128">128</div>
              <div className="tile t512">512</div>
              <div className="tile t2048">2048</div>
              <div className="tile empty" />
            </div>
          )}

          {selectedGame === "Sudoku" && (
            <div className="lp-mini-sudoku">
              <div className="s-cell fixed">5</div>
              <div className="s-cell">3</div>
              <div className="s-cell fixed">7</div>
              <div className="s-cell">6</div>
              <div className="s-cell highlight">1</div>
              <div className="s-cell">9</div>
              <div className="s-cell fixed">8</div>
              <div className="s-cell">4</div>
              <div className="s-cell fixed">2</div>
            </div>
          )}

          {selectedGame === "Pattern Memory" && (
            <div className="lp-mini-pattern">
              <div className="p-cell lit" />
              <div className="p-cell" />
              <div className="p-cell lit" />
              <div className="p-cell" />
              <div className="p-cell lit" />
              <div className="p-cell" />
              <div className="p-cell" />
              <div className="p-cell lit" />
              <div className="p-cell" />
            </div>
          )}

          {selectedGame === "Word Puzzle" && (
            <div className="lp-mini-word">
              <div className="w-row">
                <span className="w-letter correct">S</span>
                <span className="w-letter correct">C</span>
                <span className="w-letter present">H</span>
                <span className="w-letter correct">O</span>
                <span className="w-letter correct">L</span>
                <span className="w-letter correct">A</span>
                <span className="w-letter correct">R</span>
              </div>
            </div>
          )}

          {selectedGame === "Minesweeper" && (
            <div className="lp-mini-mines">
              <div className="m-cell c1">1</div>
              <div className="m-cell c2">2</div>
              <div className="m-cell flag">🚩</div>
              <div className="m-cell c1">1</div>
              <div className="m-cell">💣</div>
              <div className="m-cell c1">1</div>
            </div>
          )}
        </div>

        {/* Stats Row */}
        <div className="lp-game-stats-bar">
          <div className="stat">
            <Trophy size={13} className="amber-text" />
            <span>Best Score: <strong>4,096</strong></span>
          </div>
          <div className="stat">
            <Brain size={13} className="amber-text" />
            <span>Focus Streak: <strong>5 Days</strong></span>
          </div>
          <div className="stat">
            <Award size={13} className="amber-text" />
            <span>6 Built-in Games</span>
          </div>
        </div>

        <div className="lp-mock-footer">
          <span className="lp-footer-tag">
            <Target size={13} /> Instant cognitive refresh between application tasks
          </span>
          <span className="lp-action-badge amber">Play & Refresh</span>
        </div>
      </div>
    </div>
  );
}
