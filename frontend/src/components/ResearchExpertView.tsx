import React, { useEffect, useState, useRef, lazy, Suspense } from "react";
import {
  BookOpen,
  Upload,
  FileText,
  Trash2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Lightbulb,
  Rocket,
  Compass,
  Zap,
  Lock,
  RefreshCw,
  Search,
  ChevronRight,
  ArrowRight,
  Layers,
  HelpCircle,
  Globe,
  Calendar,
  ExternalLink,
  Users,
  BookMarked,
  Library,
  BarChart3,
  ClipboardCheck,
  Sigma,
  GitCompare,
  FlaskConical,
  ChevronLeft,
  ChevronDown,
  Save,
  Bookmark,
  Clock,
  X
} from "lucide-react";
import {
  ResearchPaper,
  PaperAnalysisResult,
  SavedAnalysis,
  listResearchPapers,
  getResearchPaper,
  uploadResearchPaper,
  deleteResearchPaper,
  retryResearchPaper,
  analyzeResearchPaper,
  listSavedAnalyses,
  saveResearchAnalysis,
  deleteSavedAnalysis
} from "../lib/api";
import { PREDEFINED_RESEARCH_PROMPTS } from "../lib/researchPrompts";
import { Modal } from "./Modal";
import { useUsage } from "../contexts/UsageContext";
import "./research-expert.css";

// Lazy-loaded so the heavy PDF.js bundle is only fetched when the user actually
// opens "View in PDF", keeping the main app bundle lean.
const ResearchPdfViewer = lazy(() =>
  import("./ResearchPdfViewer").then((m) => ({ default: m.ResearchPdfViewer }))
);

const ICON_MAP: Record<string, React.ElementType> = {
  FileText,
  Cpu,
  CheckCircle2,
  Lightbulb,
  AlertTriangle,
  Rocket,
  Compass,
  Library,
  BarChart3,
  ClipboardCheck,
  Sigma,
  GitCompare,
  FlaskConical
};

function formatAuthorsDisplay(authorsStr?: string): string {
  if (!authorsStr || !authorsStr.trim()) return "Authors unavailable";

  const list = authorsStr
    .split(/[,;]|\band\b/i)
    .map((a) => a.trim())
    .filter(Boolean);

  if (list.length === 0) return authorsStr;

  if (list.length <= 6) {
    return list.join(", ");
  }

  const first6 = list.slice(0, 6).join(", ");
  const extraCount = list.length - 6;
  return `${first6} ... and ${extraCount} more`;
}

// Matches single or grouped section citations, e.g. "[Section #21]",
// "[Section #2, #3, #10]", "[Sections #2 and #21]", "[Chunk #5]".
const CITATION_RE = /\[(?:Chunks?|Sections?)\s*#?\d+(?:\s*(?:,|and|&)\s*#?\d+)*\]/i;

function formatInlineMarkdown(text: string, onChunkClick?: (chunkIndex: number) => void): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = new RegExp(`(\\*\\*[^*]+\\*\\*|${CITATION_RE.source}|\\*[^*]+\\*)`, "gi");
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let keyIndex = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(<strong key={keyIndex++}>{token.slice(2, -2)}</strong>);
    } else if (CITATION_RE.test(token)) {
      // A citation may reference several sections at once. Render each section
      // number as its own clickable pill so every reference is navigable.
      const nums = (token.match(/\d+/g) || []).map((n) => parseInt(n, 10));
      nums.forEach((num, i) => {
        if (i > 0) parts.push(" ");
        const label = `[Section #${num}]`;
        if (onChunkClick) {
          parts.push(
            <button
              key={keyIndex++}
              className="inline-chunk-citation clickable"
              onClick={() => onChunkClick(num - 1)} // Convert 1-indexed to 0-indexed
              title="Click to view this section"
            >
              {label}
            </button>
          );
        } else {
          parts.push(
            <span key={keyIndex++} className="inline-chunk-citation">
              {label}
            </span>
          );
        }
      });
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(<em key={keyIndex++}>{token.slice(1, -1)}</em>);
    } else {
      parts.push(token);
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function renderFormattedMarkdown(text: string, onChunkClick?: (chunkIndex: number) => void) {
  if (!text) return null;

  // Normalise <br> tags and carriage returns
  const normalized = text.replace(/<br\s*\/?>/gi, "\n").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const elements: React.ReactNode[] = [];

  let inTable = false;
  let tableHeader: string[] = [];
  let tableRows: string[][] = [];
  let currentUl: string[] = [];
  let currentOl: string[] = [];
  let olStart = 1;

  // ---- flush helpers --------------------------------------------------------
  const flushUl = (keyPrefix: string) => {
    if (currentUl.length === 0) return;
    elements.push(
      <ul key={`${keyPrefix}-ul`} className="markdown-ul">
        {currentUl.map((item, i) => (
          <li key={i}>{formatInlineMarkdown(item, onChunkClick)}</li>
        ))}
      </ul>
    );
    currentUl = [];
  };

  const flushOl = (keyPrefix: string) => {
    if (currentOl.length === 0) return;
    elements.push(
      <ol key={`${keyPrefix}-ol`} className="markdown-ol" start={olStart}>
        {currentOl.map((item, i) => (
          <li key={i}>{formatInlineMarkdown(item, onChunkClick)}</li>
        ))}
      </ol>
    );
    currentOl = [];
    olStart = 1;
  };

  const flushTable = (keyPrefix: string) => {
    if (!inTable) return;
    elements.push(
      <div key={`${keyPrefix}-table-wrap`} className="markdown-table-container">
        <table className="markdown-table">
          <thead>
            <tr>
              {tableHeader.map((th, i) => (
                <th key={i}>{formatInlineMarkdown(th.trim(), onChunkClick)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{formatInlineMarkdown(cell.trim(), onChunkClick)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    inTable = false;
    tableHeader = [];
    tableRows = [];
  };

  const flushAll = (keyPrefix: string) => {
    flushUl(keyPrefix);
    flushOl(keyPrefix);
    flushTable(keyPrefix);
  };

  // ---- helpers ---------------------------------------------------------------
  /** Parse a pipe-separated row — lenient: doesn't require trailing | */
  const parsePipeRow = (raw: string): string[] => {
    const s = raw.trim();
    // Strip leading | and optional trailing |
    const inner = s.startsWith("|") ? s.slice(1) : s;
    const stripped = inner.endsWith("|") ? inner.slice(0, -1) : inner;
    return stripped.split("|").map((c) => c.trim());
  };

  /** True if every cell in the row is a separator like --- or :---: */
  const isSeparatorRow = (cells: string[]) =>
    cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c.trim()));

  // ---- main loop -------------------------------------------------------------
  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const key = `line-${idx}`;

    // ----- pipe table rows (lenient: starts with |) -------------------------
    if (trimmed.startsWith("|")) {
      flushUl(key);
      flushOl(key);
      const cells = parsePipeRow(trimmed);
      if (isSeparatorRow(cells)) return; // skip divider row
      if (!inTable) {
        inTable = true;
        tableHeader = cells;
      } else {
        tableRows.push(cells);
      }
      return;
    } else {
      flushTable(key);
    }

    // ----- numbered list (1. 2. 3.) -----------------------------------------
    const olMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      flushUl(key);
      if (currentOl.length === 0) olStart = parseInt(olMatch[1], 10);
      currentOl.push(olMatch[2]);
      return;
    } else {
      flushOl(key);
    }

    // ----- bullet list (- * •) ----------------------------------------------
    if (
      trimmed.startsWith("- ") ||
      trimmed.startsWith("* ") ||
      trimmed.startsWith("• ")
    ) {
      currentUl.push(trimmed.substring(2));
      return;
    } else {
      flushUl(key);
    }

    // ----- headings ----------------------------------------------------------
    if (trimmed.startsWith("#### ")) {
      elements.push(<h5 key={key}>{formatInlineMarkdown(trimmed.slice(5), onChunkClick)}</h5>);
    } else if (trimmed.startsWith("### ")) {
      elements.push(<h4 key={key}>{formatInlineMarkdown(trimmed.slice(4), onChunkClick)}</h4>);
    } else if (trimmed.startsWith("## ")) {
      elements.push(<h3 key={key}>{formatInlineMarkdown(trimmed.slice(3), onChunkClick)}</h3>);
    } else if (trimmed.startsWith("# ")) {
      elements.push(<h2 key={key}>{formatInlineMarkdown(trimmed.slice(2), onChunkClick)}</h2>);

    // ----- horizontal rule ---------------------------------------------------
    } else if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed)) {
      elements.push(<hr key={key} className="markdown-hr" />);

    // ----- blank line --------------------------------------------------------
    } else if (trimmed === "") {
      // only add spacer if there's real content above, not at start
      if (elements.length > 0) {
        elements.push(<div key={key} className="markdown-gap" />);
      }

    // ----- paragraph ---------------------------------------------------------
    } else {
      elements.push(<p key={key}>{formatInlineMarkdown(trimmed, onChunkClick)}</p>);
    }
  });

  flushAll("end");
  return elements;
}

export function ResearchExpertView({
  refreshTrigger,
  onNavigateToPlans
}: {
  refreshTrigger?: number;
  onNavigateToPlans?: () => void;
}) {
  const { usageData, refreshUsage } = useUsage();

  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [maxLibraryLimit, setMaxLibraryLimit] = useState<number>(20);
  const [activePaperId, setActivePaperId] = useState<string | null>(null);
  const [activePaper, setActivePaper] = useState<ResearchPaper | null>(null);
  const [analysisResult, setAnalysisResult] = useState<PaperAnalysisResult | null>(null);

  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [uploading, setUploading] = useState<boolean>(false);
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);

  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [paperToDelete, setPaperToDelete] = useState<ResearchPaper | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [retrying, setRetrying] = useState<boolean>(false);
  
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [pdfViewerSource, setPdfViewerSource] = useState<PaperAnalysisResult["sources"][number] | null>(null);

  // Layout controls: collapsible library sidebar + collapsible prompts section so
  // the analysis output is not buried below the (now 12) prompt cards.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [promptsCollapsed, setPromptsCollapsed] = useState<boolean>(false);

  // Saved analysis outputs (max 10 per paper).
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [savedMax, setSavedMax] = useState<number>(10);
  const [savingAnalysis, setSavingAnalysis] = useState<boolean>(false);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  const [savedModalOpen, setSavedModalOpen] = useState<boolean>(false);
  const [expandedSavedIds, setExpandedSavedIds] = useState<Set<string>>(new Set());
  const [deletingSavedId, setDeletingSavedId] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);

  const renderSourceProse = (rawText: string): React.ReactNode => {
    if (!rawText) return null;

    // 1. Fix hyphenated word wraps across lines: e.g. "classifi-\n cation" -> "classification"
    let text = rawText.replace(/(\b[a-zA-Z]{2,})\s*-\s*\n\s*([a-zA-Z]{2,}\b)/g, "$1$2");

    // 2. Fix spaced-out capital letter headers (e.g. "A R T I C L E  I N F O" -> "ARTICLE INFO")
    text = text.replace(/(?:\b[A-Z]\s+){3,}[A-Z]\b/g, (match) => match.replace(/\s+/g, ""));

    // 3. Fix spaced-out single letters within words (e.g. "I m a g e" -> "Image")
    text = text.replace(/(?<=\b[a-zA-Z])\s+(?=[a-zA-Z]\b)/g, "");

    // 4. Split into double-newline paragraph blocks
    const blocks = text.split(/\n\s*\n/);

    return (
      <div className="source-full-prose">
        {blocks.map((block, bIdx) => {
          const trimmed = block.trim();
          if (!trimmed) return null;

          // If block is a page marker like "--- Page 1 ---"
          if (/^---\s*Page\s+\d+\s*---$/i.test(trimmed)) {
            return (
              <div key={bIdx} className="source-page-divider">
                <span>{trimmed}</span>
              </div>
            );
          }

          const lines = trimmed.split("\n");

          // If block contains math formulas, equations, or algorithm steps
          const isMathOrCodeBlock = lines.length > 1 && lines.some(l => 
            /^\s*(\d+:|Algorithm|Eq\.|Equation|Precision|Recall|F1|TP|FP|TN|FN|\$|\{|\}|=|\+|\*|\/)/i.test(l.trim())
          );

          if (isMathOrCodeBlock) {
            return (
              <pre key={bIdx} className="source-math-pre">
                {lines.map((l, lIdx) => (
                  <div key={lIdx} className="source-math-line">{l}</div>
                ))}
              </pre>
            );
          }

          // Unwrap single linebreaks within regular text paragraphs
          const unwrapped = lines
            .map(l => l.trim())
            .filter(Boolean)
            .join(" ");

          return (
            <p key={bIdx} className="source-paragraph">
              {unwrapped}
            </p>
          );
        })}
      </div>
    );
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Access check from usage limits
  const canUseExpert = (usageData?.limits?.can_use_research_reader ?? 0) === 1;
  const papersPerMonthLimit = usageData?.limits?.research_papers_per_month ?? 0;
  const papersUsed = usageData?.usage?.research_papers_per_month ?? 0;

  useEffect(() => {
    if (canUseExpert) {
      loadPapers();
    } else {
      setLoadingList(false);
    }
  }, [canUseExpert]);

  const loadPapers = async () => {
    setLoadingList(true);
    setErrorMsg(null);
    try {
      const res = await listResearchPapers();
      setPapers(res.papers);
      if (res.max_library_limit) setMaxLibraryLimit(res.max_library_limit);
      
      // If there's an active paper, reload its details to sync status
      if (activePaperId) {
        const currentPaper = res.papers.find(p => p.id === activePaperId);
        if (currentPaper) {
          // Update active paper with fresh data from the list
          setActivePaper(currentPaper);
        }
      } else if (res.papers.length > 0) {
        // No active paper, select the first one
        selectPaper(res.papers[0].id);
      }
    } catch (err: any) {
      console.error("Failed to list research papers:", err);
      setErrorMsg(err.message || "Failed to load research papers");
    } finally {
      setLoadingList(false);
    }
  };

  // React to the global header "Refresh data" button (App.tsx refreshActiveTab),
  // so Research Expert reloads its paper list alongside every other view.
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0 && canUseExpert) {
      loadPapers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const loadSavedAnalyses = async (paperId: string) => {
    try {
      const res = await listSavedAnalyses(paperId);
      setSavedAnalyses(res.analyses || []);
      if (res.max) setSavedMax(res.max);
    } catch (err) {
      // Non-fatal: saved analyses are a convenience layer.
      console.error("Failed to load saved analyses:", err);
      setSavedAnalyses([]);
    }
  };

  const selectPaper = async (paperId: string) => {
    setActivePaperId(paperId);
    setAnalysisResult(null);
    setErrorMsg(null);
    setPromptsCollapsed(false);
    setExpandedSavedIds(new Set());
    setSavedAnalyses([]);
    try {
      const [paperData] = await Promise.all([
        getResearchPaper(paperId),
        loadSavedAnalyses(paperId),
      ]);
      setActivePaper(paperData);
    } catch (err: any) {
      console.error("Failed to load paper details:", err);
      setErrorMsg(err.message || "Failed to load paper details");
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (papers.length >= maxLibraryLimit) {
      setErrorMsg(`Library limit reached (${papers.length}/${maxLibraryLimit} papers). Please delete an existing paper to upload a new one.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("Only PDF files are supported in Research Expert.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg("File size exceeds maximum allowed 10 MB limit.");
      return;
    }

    setUploading(true);
    setErrorMsg(null);

    try {
      const newPaper = await uploadResearchPaper(file);
      setPapers((prev) => [newPaper, ...prev]);
      setActivePaperId(newPaper.id);
      setActivePaper(newPaper);
      setAnalysisResult(null);
      setSavedAnalyses([]);
      setExpandedSavedIds(new Set());
      setPromptsCollapsed(false);
      refreshUsage();
    } catch (err: any) {
      console.error("Paper upload failed:", err);
      setErrorMsg(err.message || "Failed to upload and process PDF paper.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAnalyze = async (promptText: string, promptId?: string) => {
    if (!activePaperId) {
      setErrorMsg("Please select a paper to analyze.");
      return;
    }
    if (!promptText.trim()) return;

    setAnalyzing(true);
    setActivePromptId(promptId || null);
    setErrorMsg(null);
    setExpandedSources(new Set()); // Reset expanded sources for new analysis
    setPromptsCollapsed(true); // Collapse the tall prompt grid so the output shows near the top

    try {
      const result = await analyzeResearchPaper(activePaperId, promptText.trim());
      setAnalysisResult(result);
      refreshUsage();
    } catch (err: any) {
      console.error("Analysis failed:", err);
      setErrorMsg(err.message || "Failed to analyze paper.");
    } finally {
      setAnalyzing(false);
    }
  };

  // Bring the freshly-generated answer into view so it never sits hidden below
  // the prompts / ask box.
  useEffect(() => {
    if (analysisResult && !analyzing && resultRef.current) {
      resultRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [analysisResult, analyzing]);

  const handleSaveAnalysis = async () => {
    if (!activePaperId || !analysisResult) return;
    if (savedAnalyses.length >= savedMax) {
      setErrorMsg(`Saved analysis limit reached (${savedAnalyses.length}/${savedMax}). Delete a saved analysis to save a new one.`);
      return;
    }
    setSavingAnalysis(true);
    setErrorMsg(null);
    try {
      const saved = await saveResearchAnalysis(activePaperId, {
        prompt: analysisResult.prompt,
        answer: analysisResult.answer,
        sources: analysisResult.sources,
        model_used: analysisResult.model_used,
        charged_credits: analysisResult.charged_credits,
      });
      setSavedAnalyses((prev) => [saved, ...prev]);
      setJustSavedId(saved.id);
      setTimeout(() => setJustSavedId((id) => (id === saved.id ? null : id)), 2500);
    } catch (err: any) {
      console.error("Failed to save analysis:", err);
      setErrorMsg(err.message || "Failed to save analysis.");
    } finally {
      setSavingAnalysis(false);
    }
  };

  const handleDeleteSavedAnalysis = async (analysisId: string) => {
    if (!activePaperId) return;
    setDeletingSavedId(analysisId);
    try {
      await deleteSavedAnalysis(activePaperId, analysisId);
      setSavedAnalyses((prev) => prev.filter((a) => a.id !== analysisId));
      setExpandedSavedIds((prev) => {
        const next = new Set(prev);
        next.delete(analysisId);
        return next;
      });
    } catch (err: any) {
      console.error("Failed to delete saved analysis:", err);
      setErrorMsg(err.message || "Failed to delete saved analysis.");
    } finally {
      setDeletingSavedId(null);
    }
  };

  const toggleSavedExpansion = (analysisId: string) => {
    setExpandedSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(analysisId)) next.delete(analysisId);
      else next.add(analysisId);
      return next;
    });
  };

  const toggleSourceExpansion = (chunkId: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(chunkId)) {
        next.delete(chunkId);
      } else {
        next.add(chunkId);
      }
      return next;
    });
  };

  const scrollToSource = (chunkId: string) => {
    // Expand the source first
    setExpandedSources(prev => new Set(prev).add(chunkId));
    
    // Scroll to the source card after a brief delay for expansion animation
    setTimeout(() => {
      const element = document.getElementById(`source-${chunkId}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
        // Briefly highlight the card
        element.classList.add("source-highlight");
        setTimeout(() => element.classList.remove("source-highlight"), 2000);
      }
    }, 100);
  };

  const handleDeletePaper = async () => {
    if (!paperToDelete) return;
    setDeleting(true);
    try {
      await deleteResearchPaper(paperToDelete.id);
      const remaining = papers.filter((p) => p.id !== paperToDelete.id);
      setPapers(remaining);
      if (activePaperId === paperToDelete.id) {
        if (remaining.length > 0) {
          selectPaper(remaining[0].id);
        } else {
          setActivePaperId(null);
          setActivePaper(null);
          setAnalysisResult(null);
          setSavedAnalyses([]);
          setExpandedSavedIds(new Set());
        }
      }
      setPaperToDelete(null);
      refreshUsage();
    } catch (err: any) {
      console.error("Delete paper failed:", err);
      setErrorMsg(err.message || "Failed to delete paper.");
    } finally {
      setDeleting(false);
    }
  };

  const handleRetry = async (paperId: string) => {
    setRetrying(true);
    setErrorMsg(null);
    try {
      const updated = await retryResearchPaper(paperId);
      setPapers((prev) => prev.map((p) => (p.id === paperId ? updated : p)));
      if (activePaperId === paperId) {
        setActivePaper(updated);
      }
      refreshUsage();
    } catch (err: any) {
      console.error("Failed to retry paper processing:", err);
      setErrorMsg(err.message || "Failed to retry paper processing.");
    } finally {
      setRetrying(false);
    }
  };

  // Render Upgrade Prompt if user tier is Free / General
  if (!canUseExpert) {
    const planPhrase = usageData?.advisor_atlas_plan_phrase || "the Pro or Max plan";
    return (
      <div className="research-expert-wrapper">
        <div className="research-expert-upgrade-card">
          <div className="upgrade-icon-badge">
            <BookOpen size={36} />
            <Lock size={18} className="lock-sub-icon" />
          </div>
          <h2>Research Expert Workspace</h2>
          <p className="upgrade-description">
            Analyze academic papers, pull out key findings, and get answers grounded directly in the paper using AI.
            Research Expert is available exclusively on <strong>{planPhrase}</strong>.
          </p>
          <div className="upgrade-features-list">
            <div className="feature-item">
              <CheckCircle2 size={18} className="feature-icon" />
              <span>Full-text reading with AI-powered section analysis</span>
            </div>
            <div className="feature-item">
              <CheckCircle2 size={18} className="feature-icon" />
              <span>AI-powered search across the paper&rsquo;s full content</span>
            </div>
            <div className="feature-item">
              <CheckCircle2 size={18} className="feature-icon" />
              <span>13 in-depth analytical prompts to dissect any paper</span>
            </div>
            <div className="feature-item">
              <CheckCircle2 size={18} className="feature-icon" />
              <span>Custom Q&amp;A with direct section citations and relevance scores</span>
            </div>
          </div>
          <button
            className="upgrade-btn-primary"
            onClick={onNavigateToPlans}
          >
            <Zap size={18} />
            <span>Upgrade to Unlock Research Expert</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="research-expert-container">
      {/* Header Bar */}
      <div className="expert-header-bar">
        <div className="expert-header-title">
          <div className="title-icon-box">
            <BookOpen size={24} />
          </div>
          <div>
            <h1>Research Expert</h1>
            <p>AI-assisted single-paper deep analysis</p>
          </div>
        </div>

        <div className="expert-header-meta">
          <div className="quota-pill" title="Monthly paper upload quota">
            <Layers size={14} />
            <span>
              Upload Quota: <strong>{papersUsed}</strong> / {papersPerMonthLimit === -1 ? "∞" : papersPerMonthLimit} per month
            </span>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf"
            style={{ display: "none" }}
          />

          <button
            className="upload-paper-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <RefreshCw size={16} className="spin" />
                <span>Processing PDF...</span>
              </>
            ) : (
              <>
                <Upload size={16} />
                <span>Upload Paper (PDF)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="expert-error-banner">
          <AlertTriangle size={18} />
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="error-close-btn">&times;</button>
        </div>
      )}

      {/* Main Grid: Sidebar vs Main Workspace */}
      <div className={`expert-workspace-grid ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
        {/* Collapsed library rail */}
        {sidebarCollapsed && (
          <button
            type="button"
            className="expert-sidebar collapsed"
            onClick={() => setSidebarCollapsed(false)}
            title="Expand library"
            aria-label="Expand library"
          >
            <span className="sidebar-rail-expand">
              <ChevronRight size={16} />
            </span>
            <span className="sidebar-rail-icon">
              <Library size={18} />
              <span className="sidebar-rail-count">{papers.length}</span>
            </span>
            <span className="sidebar-rail-text">Library</span>
          </button>
        )}

        {/* Left Sidebar: Paper Library */}
        {!sidebarCollapsed && (
        <div className="expert-sidebar">
          <div className="sidebar-section-header">
            <div>
              <h3>Library ({papers.length} / {maxLibraryLimit})</h3>
              {papers.length >= maxLibraryLimit && (
                <span className="text-[11px] font-semibold text-amber-600 block mt-0.5">
                  Full ({papers.length}/{maxLibraryLimit}) — Delete to add new
                </span>
              )}
            </div>
            <div className="sidebar-header-actions">
              <button onClick={loadPapers} className="icon-refresh-btn" title="Refresh library">
                <RefreshCw size={14} className={loadingList ? "spin" : ""} />
              </button>
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="icon-refresh-btn"
                title="Collapse library"
                aria-label="Collapse library"
              >
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          <div className="paper-list">
            {loadingList ? (
              <div className="paper-list-loading">
                <RefreshCw size={20} className="spin" />
                <span>Loading library...</span>
              </div>
            ) : papers.length === 0 ? (
              <div className="paper-list-empty">
                <FileText size={32} />
                <p>No research papers uploaded yet.</p>
                <button
                  className="upload-dropzone-btn"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload your first PDF
                </button>
              </div>
            ) : (
              papers.map((p) => {
                const isActive = p.id === activePaperId;
                return (
                  <div
                    key={p.id}
                    className={`paper-card-item ${isActive ? "active" : ""}`}
                    onClick={() => selectPaper(p.id)}
                  >
                    <div className="paper-card-main">
                      <FileText size={18} className="paper-card-icon" />
                      <div className="paper-card-info">
                        <span className="paper-card-title">{p.title}</span>
                        <div className="paper-card-sub">
                          <span className={`status-tag status-${p.status}`}>
                            {p.status}
                          </span>
                          <span>{p.chunk_count} sections ready</span>
                        </div>
                      </div>
                    </div>
                    <div className="paper-actions-row">
                      {p.status === "error" && (
                        <button
                          className="paper-retry-btn"
                          title="Retry processing paper"
                          disabled={retrying}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRetry(p.id);
                          }}
                        >
                          <RefreshCw size={13} className={retrying ? "spin" : ""} />
                        </button>
                      )}
                      <button
                        className="paper-delete-btn"
                        title="Delete paper"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaperToDelete(p);
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        )}

        {/* Right Main Content: Paper Workspace */}
        <div className="expert-main-panel">
          {!activePaper ? (
            <div className="no-active-paper-placeholder">
              <BookOpen size={48} className="placeholder-icon" />
              <h2>Select or Upload a Research Paper</h2>
              <p>Choose an uploaded paper from the left library or upload a new PDF to begin AI analysis.</p>
            </div>
          ) : (
            <div className="active-paper-workspace">
              {/* Paper Detail Header Card */}
              <div className="active-paper-header-card flex items-center justify-between gap-4">
                <div className="active-paper-info min-w-0">
                  <span className="active-paper-badge">Active Paper</span>
                  <h2>{activePaper.title}</h2>
                  
                  <p className="active-paper-authors flex items-center gap-1.5">
                    <Users size={14} className="shrink-0 text-slate-500" />
                    <span><strong>Authors:</strong> {formatAuthorsDisplay(activePaper.authors)}</span>
                  </p>

                  {(activePaper.journal_conference || activePaper.publication_year || activePaper.volume_issue_pages || activePaper.doi) && (
                    <div className="paper-pub-metadata-row">
                      {activePaper.journal_conference && (
                        <span className="pub-meta-chip" title="Journal / Conference">
                          <Globe size={13} /> {activePaper.journal_conference}
                        </span>
                      )}
                      {activePaper.publication_year && (
                        <span className="pub-meta-chip" title="Publication Year">
                          <Calendar size={13} /> {activePaper.publication_year}
                        </span>
                      )}
                      {activePaper.volume_issue_pages && (
                        <span className="pub-meta-chip" title="Volume / Issue / Pages">
                          <BookOpen size={13} /> {activePaper.volume_issue_pages}
                        </span>
                      )}
                      {activePaper.doi && (
                        <a
                          href={activePaper.doi.startsWith("http") ? activePaper.doi : `https://doi.org/${activePaper.doi}`}
                          target="_blank"
                          rel="noreferrer"
                          className="pub-meta-chip doi-link"
                          title="DOI Link"
                        >
                          <ExternalLink size={13} /> {activePaper.doi}
                        </a>
                      )}
                    </div>
                  )}

                  <div className="active-paper-stats">
                    <span>Status: <strong className={`status-${activePaper.status}`}>{activePaper.status}</strong></span>
                    <span>•</span>
                    <span>Sections: <strong>{activePaper.chunk_count}</strong></span>
                    <span>•</span>
                    <span>Uploaded: {new Date(activePaper.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="active-paper-header-actions shrink-0">
                  <button
                    type="button"
                    className="saved-open-btn"
                    onClick={() => setSavedModalOpen(true)}
                    title="View your saved analysis outputs"
                  >
                    <Bookmark size={15} />
                    <span>Saved</span>
                    <span className="saved-count-badge">{savedAnalyses.length}/{savedMax}</span>
                  </button>
                  {activePaper.status === "error" && (
                    <button
                      type="button"
                      onClick={() => handleRetry(activePaper.id)}
                      disabled={retrying}
                      className="retry-paper-btn"
                    >
                      <RefreshCw size={14} className={retrying ? "spin" : ""} />
                      {retrying ? "Retrying…" : "Retry Processing"}
                    </button>
                  )}
                </div>
              </div>

              {/* Predefined Analytical Prompts Section (collapsible) */}
              <div className="prompts-section">
                <button
                  type="button"
                  className="section-title-row collapsible"
                  onClick={() => setPromptsCollapsed((v) => !v)}
                  aria-expanded={!promptsCollapsed}
                >
                  <Sparkles size={18} className="sparkle-icon" />
                  <h3>Predefined Analytical Prompts</h3>
                  <span className="section-collapse-hint">
                    {promptsCollapsed ? `Show ${PREDEFINED_RESEARCH_PROMPTS.length} prompts` : "Hide"}
                    <ChevronDown
                      size={16}
                      className={`section-chevron ${promptsCollapsed ? "" : "open"}`}
                    />
                  </span>
                </button>

                {!promptsCollapsed && (
                  <div className="prompts-grid">
                    {PREDEFINED_RESEARCH_PROMPTS.map((p) => {
                      const IconComp = ICON_MAP[p.icon] || FileText;
                      const isSelected = activePromptId === p.id && analyzing;
                      return (
                        <button
                          key={p.id}
                          className={`prompt-card-btn ${isSelected ? "analyzing" : ""}`}
                          onClick={() => handleAnalyze(p.prompt, p.id)}
                          disabled={analyzing || activePaper.status !== "ready"}
                        >
                          <div className="prompt-card-header">
                            <IconComp size={18} className="prompt-icon" />
                            <span className="prompt-title">{p.title}</span>
                          </div>
                          <p className="prompt-desc">{p.description}</p>
                          <div className="prompt-action-link">
                            <span>{isSelected ? "Analyzing..." : "Generate Analysis"}</span>
                            <ArrowRight size={14} />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Custom Question Input */}
              <div className="custom-question-box">
                <div className="section-title-row">
                  <HelpCircle size={18} />
                  <h3>Ask Custom Question</h3>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customPrompt.trim()) {
                      handleAnalyze(customPrompt);
                    }
                  }}
                  className="question-form"
                >
                  <input
                    type="text"
                    placeholder="e.g. What is the baseline model accuracy compared to the proposed method?"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    disabled={analyzing || activePaper.status !== "ready"}
                    className="question-input"
                  />
                  <button
                    type="submit"
                    className="ask-btn"
                    disabled={analyzing || !customPrompt.trim() || activePaper.status !== "ready"}
                  >
                    {analyzing && !activePromptId ? (
                      <>
                        <RefreshCw size={16} className="spin" />
                        <span>Searching & analyzing...</span>
                      </>
                    ) : (
                      <>
                        <Search size={16} />
                        <span>Ask AI</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Analysis Result Viewer */}
              {analyzing && (
                <div className="analysis-loading-state">
                  <RefreshCw size={28} className="spin" />
                  <h4>Searching the paper & writing your answer</h4>
                  <p>Reading the paper and preparing your analysis…</p>
                </div>
              )}

              {analysisResult && !analyzing && (() => {
                const isCurrentSaved = savedAnalyses.some(
                  (a) => a.answer === analysisResult.answer && a.prompt === analysisResult.prompt
                );
                const saveLimitReached = savedAnalyses.length >= savedMax;
                return (
                <div className="analysis-result-panel" ref={resultRef}>
                  <div className="result-header">
                    <div className="result-prompt-tag">
                      <Sparkles size={16} />
                      <span>{analysisResult.prompt}</span>
                    </div>

                    <div className="result-meta-tokens">
                      <span title="AI credits used for this analysis">
                        {(analysisResult.charged_credits ?? 0).toLocaleString()} credits used
                      </span>
                      <button
                        type="button"
                        className={`save-output-btn ${isCurrentSaved ? "saved" : ""}`}
                        onClick={handleSaveAnalysis}
                        disabled={savingAnalysis || isCurrentSaved || saveLimitReached}
                        title={
                          isCurrentSaved
                            ? "This output is already saved"
                            : saveLimitReached
                              ? `Saved analysis limit reached (${savedAnalyses.length}/${savedMax}) — delete one to save`
                              : `Save this output (${savedAnalyses.length}/${savedMax} saved)`
                        }
                      >
                        {savingAnalysis ? (
                          <RefreshCw size={14} className="spin" />
                        ) : isCurrentSaved ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <Save size={14} />
                        )}
                        <span>
                          {isCurrentSaved ? "Saved" : savingAnalysis ? "Saving…" : "Save output"}
                          {!isCurrentSaved && ` (${savedAnalyses.length}/${savedMax})`}
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="result-body-markdown">
                    {renderFormattedMarkdown(analysisResult.answer, (chunkIndex) => {
                      // Find the source with this chunk index and scroll to it
                      const source = analysisResult.sources.find(s => s.chunk_index === chunkIndex);
                      if (source) {
                        scrollToSource(source.chunk_id);
                      }
                    })}
                  </div>

                  {/* Sources & Citations */}
                  {analysisResult.sources && analysisResult.sources.length > 0 && (
                    <div className="result-sources-section">
                      <h4>
                        <Layers size={16} />
                        <span>Paper Sections ({analysisResult.sources.length})</span>
                      </h4>
                      <div className="sources-list">
                        {analysisResult.sources.map((src, i) => {
                          const isExpanded = expandedSources.has(src.chunk_id);
                          const pageNumStr = src.page_numbers && src.page_numbers.length > 0
                            ? src.page_numbers.length === 1
                              ? `Page ${src.page_numbers[0]}`
                              : `Pages ${src.page_numbers[0]}-${src.page_numbers[src.page_numbers.length - 1]}`
                            : null;
                          
                          return (
                            <div 
                              key={src.chunk_id || i} 
                              id={`source-${src.chunk_id}`}
                              className="source-citation-card"
                            >
                              <div className="source-card-head">
                                <div className="source-card-head-left">
                                  <span className="chunk-badge">Section #{src.chunk_index + 1}</span>
                                  {pageNumStr && (
                                    <span className="page-badge" title="Page location in PDF">
                                      <FileText size={12} />
                                      {pageNumStr}
                                    </span>
                                  )}
                                </div>
                                <span className="similarity-badge">
                                  Relevance: {Math.round(src.similarity_score * 100)}%
                                </span>
                              </div>
                              
                              {!isExpanded && (
                                <p className="source-snippet">"{src.snippet}"</p>
                              )}
                              
                              {isExpanded && src.full_text && (
                                renderSourceProse(src.full_text)
                              )}
                              
                              <div className="source-card-actions">
                                <button
                                  className="source-expand-btn"
                                  onClick={() => toggleSourceExpansion(src.chunk_id)}
                                  title={isExpanded ? "Show less" : "Show full section"}
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronRight size={14} className="chevron-up" />
                                      <span>Show Less</span>
                                    </>
                                  ) : (
                                    <>
                                      <ChevronRight size={14} className="chevron-down" />
                                      <span>Show Full Section</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  className="source-pdf-btn"
                                  title={`View in PDF${src.page_numbers && src.page_numbers.length > 0 ? ` (${pageNumStr})` : ''}`}
                                  onClick={() => setPdfViewerSource(src)}
                                >
                                  <BookMarked size={14} />
                                  <span>View in PDF</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                );
              })()}

              {/* Saved Analyses modal (opened from the header "Saved" button) */}
              {savedModalOpen && (
                <Modal onClose={() => setSavedModalOpen(false)} compact>
                  <div className="modal-panel saved-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="saved-modal-header">
                      <div className="saved-modal-title">
                        <span className="saved-modal-icon">
                          <Bookmark size={18} />
                        </span>
                        <div>
                          <h3>Saved Analyses</h3>
                          <p>{savedAnalyses.length} of {savedMax} saved for this paper</p>
                        </div>
                      </div>
                      <button
                        className="saved-modal-close"
                        onClick={() => setSavedModalOpen(false)}
                        aria-label="Close saved analyses"
                      >
                        <X size={20} />
                      </button>
                    </div>
                    <div className="saved-modal-body">
                      {savedAnalyses.length === 0 ? (
                        <div className="saved-modal-empty">
                          <Bookmark size={30} />
                          <p>No saved analyses yet.</p>
                          <span>Run an analysis, then click <strong>Save output</strong> to keep it here for later.</span>
                        </div>
                      ) : (
                        <div className="saved-analyses-list">
                      {savedAnalyses.map((sa) => {
                        const isOpen = expandedSavedIds.has(sa.id);
                        const savedDate = new Date(sa.created_at);
                        return (
                          <div
                            key={sa.id}
                            className={`saved-analysis-card ${justSavedId === sa.id ? "just-saved" : ""}`}
                          >
                            <div className="saved-analysis-head">
                              <button
                                type="button"
                                className="saved-analysis-toggle"
                                onClick={() => toggleSavedExpansion(sa.id)}
                              >
                                <ChevronDown
                                  size={15}
                                  className={`section-chevron ${isOpen ? "open" : ""}`}
                                />
                                <span className="saved-analysis-prompt" title={sa.prompt}>
                                  {sa.prompt}
                                </span>
                              </button>
                              <div className="saved-analysis-meta">
                                <span className="saved-analysis-date" title="Saved on">
                                  <Clock size={12} />
                                  {savedDate.toLocaleDateString()}
                                </span>
                                <button
                                  type="button"
                                  className="saved-analysis-delete"
                                  title="Delete saved analysis"
                                  disabled={deletingSavedId === sa.id}
                                  onClick={() => handleDeleteSavedAnalysis(sa.id)}
                                >
                                  {deletingSavedId === sa.id ? (
                                    <RefreshCw size={13} className="spin" />
                                  ) : (
                                    <Trash2 size={13} />
                                  )}
                                </button>
                              </div>
                            </div>

                            {isOpen && (
                              <div className="saved-analysis-body">
                                <div className="result-body-markdown">
                                  {renderFormattedMarkdown(sa.answer)}
                                </div>
                                {sa.sources && sa.sources.length > 0 && (
                                  <div className="saved-analysis-sources">
                                    <h5>
                                      <Layers size={14} />
                                      <span>Sections ({sa.sources.length})</span>
                                    </h5>
                                    <div className="saved-sources-chips">
                                      {sa.sources.map((src, i) => {
                                        const pageStr =
                                          src.page_numbers && src.page_numbers.length > 0
                                            ? src.page_numbers.length === 1
                                              ? `p.${src.page_numbers[0]}`
                                              : `p.${src.page_numbers[0]}-${src.page_numbers[src.page_numbers.length - 1]}`
                                            : null;
                                        return (
                                          <button
                                            key={src.chunk_id || i}
                                            className="saved-source-chip"
                                            onClick={() => setPdfViewerSource(src)}
                                            title="View this section in the PDF"
                                          >
                                            <BookMarked size={12} />
                                            <span>
                                              Section #{src.chunk_index + 1}
                                              {pageStr ? ` · ${pageStr}` : ""}
                                            </span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                        </div>
                      )}
                    </div>
                  </div>
                </Modal>
              )}
            </div>
          )}
        </div>
      </div>

      {activePaper && pdfViewerSource && (
        <Suspense fallback={null}>
          <ResearchPdfViewer
            paperId={activePaper.id}
            paperTitle={activePaper.title}
            source={pdfViewerSource}
            onClose={() => setPdfViewerSource(null)}
          />
        </Suspense>
      )}

      {/* Delete Confirmation Modal */}
      {paperToDelete && (
        <Modal onClose={() => setPaperToDelete(null)}>
          <div className="modal-panel delete-paper-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header delete-modal-header">
              <div className="delete-modal-title">
                <span className="delete-modal-icon danger">
                  <Trash2 size={20} />
                </span>
                <h3>Delete Research Paper</h3>
              </div>
            </div>
            <div className="modal-body delete-modal-body">
              <p className="delete-modal-question">
                Are you sure you want to delete <strong>&ldquo;{paperToDelete.title}&rdquo;</strong>?
              </p>
              <div className="delete-warning-banner">
                <AlertTriangle size={15} className="delete-warning-icon" />
                <span>
                  This permanently removes the paper and all of its saved analysis. This action cannot be undone.
                </span>
              </div>
            </div>
            <div className="modal-actions delete-modal-actions">
              <button
                className="dm-btn dm-btn-secondary"
                onClick={() => setPaperToDelete(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="dm-btn dm-btn-danger"
                onClick={handleDeletePaper}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Delete Paper"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
