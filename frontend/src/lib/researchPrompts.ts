export type ResearchPrompt = {
  id: string;
  title: string;
  prompt: string;
  icon: string;
  category: "summary" | "methodology" | "results" | "insights" | "critical";
  description: string;
};

// Tuned for readers who already have domain background: prompts embrace technical
// terminology and go for depth rather than hand-holding. Ordered most incisive /
// analytical first. Each `prompt` is engineered to pull rigorous, structured
// output; `description` is the short blurb shown on the card. Keep ids in sync
// with backend PREDEFINED_PROMPTS.
export const PREDEFINED_RESEARCH_PROMPTS: ResearchPrompt[] = [
  {
    id: "executive_summary",
    title: "Executive Summary",
    prompt:
      "Write a precise executive summary for a technical reader. Cover, in order: (1) the problem and why it matters, (2) the core technical approach or insight, (3) the headline quantitative results with numbers, and (4) the key takeaway and where this sits relative to prior work. Be concise and precise; assume domain familiarity and do not define basic terminology.",
    icon: "FileText",
    category: "summary",
    description: "Precise, decision-ready synopsis for a technical reader."
  },
  {
    id: "contributions",
    title: "Contributions & Novelty",
    prompt:
      "Enumerate the paper's core technical contributions and articulate precisely what is novel relative to prior art. For each contribution, state the claim, the mechanism that makes it work, and the evidence supporting it. Separate genuine methodological or theoretical novelty from engineering and incremental empirical gains, and flag any contribution that is overstated relative to the evidence.",
    icon: "Lightbulb",
    category: "insights",
    description: "The core contributions and what is truly novel vs prior art."
  },
  {
    id: "methodology",
    title: "Methodology Analysis",
    prompt:
      "Dissect the methodology in technical depth. Cover the full pipeline/architecture, the data (sources, scale, preprocessing, splits), the model or algorithm design and its components, the training/optimization setup and key hyperparameters, and the evaluation protocol and metrics. Surface the non-obvious design decisions and the assumptions they encode, and call out anything under-specified.",
    icon: "Cpu",
    category: "methodology",
    description: "In-depth dissection of pipeline, data, model, and evaluation."
  },
  {
    id: "theoretical_foundations",
    title: "Theoretical Foundations & Formulation",
    prompt:
      "Lay out the formal foundations of the work. State the problem formulation and notation, the objective/loss functions, the key equations, and the assumptions they rely on. Explain the theoretical justification for why the method should work — guarantees, bounds, inductive biases, or complexity — and identify where the argument is heuristic rather than rigorous. Present core equations in clean inline math, never copied garbled PDF text.",
    icon: "Sigma",
    category: "methodology",
    description: "Formal problem setup, objectives, assumptions, and guarantees."
  },
  {
    id: "key_findings",
    title: "Key Findings & Results",
    prompt:
      "Extract the key results with quantitative rigor. Report the main metrics and numbers, the deltas over baselines, and any ablations or notable regimes. Use a comparison table where it clarifies method-vs-baseline performance. State precisely what each result supports and whether the evidence actually justifies the paper's claims.",
    icon: "CheckCircle2",
    category: "results",
    description: "Quantitative results, deltas over baselines, and what they support."
  },
  {
    id: "benchmark_comparison",
    title: "Benchmark & Baseline Comparison",
    prompt:
      "Analyze how the method positions against prior state-of-the-art and baselines. Identify the benchmarks/datasets and metrics used, the baselines compared against, and the quantitative gains (absolute and relative). Critically assess whether the comparison is fair — matched settings, adequately tuned baselines, comparable compute/data — and whether the reported gains are statistically and practically significant rather than marginal.",
    icon: "GitCompare",
    category: "results",
    description: "SOTA positioning, fairness of comparison, and significance of gains."
  },
  {
    id: "results_figures",
    title: "Results & Figures Deep-Dive",
    prompt:
      "Interpret the paper's principal figures, tables, and quantitative results at a technical level. For each key exhibit, explain what it measures, the axes/columns and direction of improvement, what the numbers imply, and the mechanism behind the observed trend. Flag surprising, counter-intuitive, or cherry-picked-looking results and what they reveal about the method's behavior.",
    icon: "BarChart3",
    category: "results",
    description: "Technical interpretation of key figures, tables, and trends."
  },
  {
    id: "critical_review",
    title: "Critical Peer Review",
    prompt:
      "Evaluate the paper as a rigorous peer reviewer. Assess novelty, technical soundness, and the strength and fairness of the empirical and theoretical evidence, plus clarity. Identify unsupported claims, methodological flaws, and confounds. Conclude with the strongest reasons to accept, the most serious weaknesses, and an overall verdict on how convincing the work is.",
    icon: "ClipboardCheck",
    category: "critical",
    description: "Reviewer-grade critique of novelty, soundness, and evidence."
  },
  {
    id: "limitations",
    title: "Limitations & Threats to Validity",
    prompt:
      "Identify the limitations, failure modes, and threats to validity — both those the authors acknowledge and those evident from the method or results. Cover assumptions, generalisability, dataset and evaluation biases, statistical rigor, edge cases, and practical or ethical risks. For each, explain the mechanism and how much it undermines the paper's conclusions.",
    icon: "AlertTriangle",
    category: "critical",
    description: "Failure modes, biases, assumptions, and threats to validity."
  },
  {
    id: "reproducibility_blueprint",
    title: "Reproducibility & Implementation Blueprint",
    prompt:
      "Produce a concrete blueprint to reproduce or re-implement this work. Extract the exact architecture/algorithm, the datasets and preprocessing, all reported hyperparameters and training details, the evaluation setup, and any released code/artifacts or compute requirements. Present it as an actionable checklist, and explicitly flag every detail that is missing or ambiguous and would block a faithful reproduction.",
    icon: "FlaskConical",
    category: "methodology",
    description: "Actionable recipe to re-implement, with missing details flagged."
  },
  {
    id: "background_related_work",
    title: "Background & Related Work",
    prompt:
      "Situate the paper in its research lineage. Summarise the prior approaches and context it builds on, the specific gap or limitation in existing work it targets, and how it differentiates from the closest related methods. Identify the key references a reader should know to fully assess the contribution.",
    icon: "Library",
    category: "insights",
    description: "Research lineage, the gap targeted, and key references."
  },
  {
    id: "practical_applications",
    title: "Practical Applications & Deployment",
    prompt:
      "Assess how the method or findings translate to practice. Identify concrete application domains and system contexts that benefit, the integration requirements, and the operational constraints (data, compute, latency, cost, maintenance). Distinguish deployment-ready capabilities from those still at the research stage.",
    icon: "Rocket",
    category: "insights",
    description: "Real-world use, integration needs, and operational constraints."
  },
  {
    id: "future_work",
    title: "Future Work & Open Problems",
    prompt:
      "Map the open problems and future directions. Include the directions the authors propose plus promising extensions and unresolved questions implied by the paper's limitations and results. For each, explain why it matters and outline a concrete next step or experiment.",
    icon: "Compass",
    category: "insights",
    description: "Open problems and concrete next directions."
  }
];
