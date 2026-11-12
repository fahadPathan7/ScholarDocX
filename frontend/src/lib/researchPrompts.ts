export type ResearchPrompt = {
  id: string;
  title: string;
  prompt: string;
  icon: string;
  category: "summary" | "methodology" | "results" | "insights" | "critical";
  description: string;
};

// Display catalogue for the predefined analyses. The backend
// (research_paper_constants.PREDEFINED_PROMPTS) is the source of truth for the
// prompt text and how each analysis searches the paper: the card sends its `id`
// and the backend runs the canonical prompt (SCHOLARDOCX-0253). Keep `prompt`
// identical to the backend text, since clients without the id are matched by
// exact text. `description` is the short blurb shown on the card.
export const PREDEFINED_RESEARCH_PROMPTS: ResearchPrompt[] = [
  {
    id: "executive_summary",
    title: "Executive Summary",
    prompt:
      "Write an executive summary for a reader who knows the field. Use exactly these headings. **Problem**: what is addressed and why existing approaches fall short. **Approach**: the core idea and what makes it different, in two or three sentences. **Results**: the headline numbers, each with its dataset, metric, and the baseline it is compared against. **Takeaway**: what a researcher should conclude, including the main caveat. Keep it under 250 words.",
    icon: "FileText",
    category: "summary",
    description: "Problem, approach, headline numbers, and the takeaway in under 250 words."
  },
  {
    id: "contributions",
    title: "Contributions & Novelty",
    prompt:
      "List the contributions the authors claim, then judge each one. For every contribution give: the claim in one line; the mechanism, meaning what in the method makes it work; the evidence, meaning which experiment or argument supports it, with numbers; and a verdict of Novel, Incremental, or Engineering, with a one-line reason. End with a short paragraph naming the most significant contribution and any claim that goes further than its evidence.",
    icon: "Lightbulb",
    category: "insights",
    description: "Each claimed contribution, its evidence, and whether it is truly novel."
  },
  {
    id: "methodology",
    title: "Methodology Analysis",
    prompt:
      "Explain the methodology so a researcher could critique it. Use these headings. **Problem setup**: inputs, outputs, and task definition. **Data**: sources, size, preprocessing, and train/validation/test splits. **Method**: the architecture or procedure step by step, and how its components interact. **Training**: objective, key hyperparameters, and compute. **Evaluation**: metrics, protocol, and baselines. **Design choices**: the three to five decisions that most shape the results, and the assumptions behind each. Mark any item the sections do not cover as \"Not found in the sections\".",
    icon: "Cpu",
    category: "methodology",
    description: "Setup, data, method, training, and evaluation, with key design choices."
  },
  {
    id: "theoretical_foundations",
    title: "Theoretical Foundations & Formulation",
    prompt:
      "Lay out the formal side of the paper. Give the problem formulation and notation; the objective or loss and the role of each term; the key formal results (theorems, bounds, convergence or complexity claims) with their assumptions; and the intuition for why the method should work. Rebuild formulas as clean inline maths from their meaning. State which claims are proven, which are argued informally, and which assumptions are strongest or least realistic. If the paper is mainly empirical, say so and describe the formal model it implicitly relies on.",
    icon: "Sigma",
    category: "methodology",
    description: "Formulation, objectives, formal results, and how rigorous they are."
  },
  {
    id: "key_findings",
    title: "Key Findings & Results",
    prompt:
      "Report the main findings with their numbers. For each finding give the result (metric, value, and dataset or setting), what it is compared with and the size of the gain, and what it shows about the method. When three or more methods are compared, put the numbers in a markdown table. Then cover the ablations: which components matter most, and by how much. Finish with **Strength of evidence**: which conclusions are well supported, and which rest on one run, small margins, or a single dataset. Quote numbers exactly as reported.",
    icon: "CheckCircle2",
    category: "results",
    description: "Main results with exact numbers, ablations, and strength of evidence."
  },
  {
    id: "benchmark_comparison",
    title: "Benchmark & Baseline Comparison",
    prompt:
      "Assess how the method compares with prior work. List the benchmarks and metrics used and why they suit the task. Give a markdown table of each baseline against the proposed method, with absolute and relative differences. Then judge fairness: same data and preprocessing, comparable model size and compute, baselines re-tuned or copied from older papers, and whether variance or significance is reported. Conclude whether the gains are meaningful in practice, marginal, or not yet established, and name the most important comparison that is missing.",
    icon: "GitCompare",
    category: "results",
    description: "Gains over baselines and whether the comparison is fair."
  },
  {
    id: "results_figures",
    title: "Results & Figures Deep-Dive",
    prompt:
      "Walk through the paper's key result exhibits in order of importance. For each, name it as the paper does (for example Figure 3), then give what it measures (axes or columns, units, and which direction is better), the main pattern, and what that pattern says about the method. Point out results that are surprising, inconsistent with the text, or that depend on selected settings. Discuss only exhibits whose content appears in the sections, and list any others that are mentioned but not shown.",
    icon: "BarChart3",
    category: "results",
    description: "What each key figure and table shows, and what to question."
  },
  {
    id: "critical_review",
    title: "Critical Peer Review",
    prompt:
      "Write a peer review as for a top venue. Use these headings. **Summary**: three or four neutral sentences. **Strengths**. **Weaknesses**: methodological flaws, missing baselines or ablations, confounds, and unsupported claims, each with why it matters. **Questions for the authors**: specific and answerable. **Verdict**: accept, weak accept, borderline, weak reject, or reject, with your confidence and the one change that would most improve the paper. Be fair and specific: tie every point to a section, experiment, or number.",
    icon: "ClipboardCheck",
    category: "critical",
    description: "Reviewer-style strengths, weaknesses, questions, and a verdict."
  },
  {
    id: "limitations",
    title: "Limitations & Threats to Validity",
    prompt:
      "Identify the limitations and threats to validity. Separate those the authors acknowledge from those you infer from the method or results. For each give the limitation, why it arises, its impact on the conclusions (High, Medium, or Low), and what would test or fix it. Cover internal validity (confounds, data leakage, tuning on test data), external validity (other datasets, domains, and scales), construct validity (whether the metrics measure the stated goal), and practical or ethical risks. Order the list by impact.",
    icon: "AlertTriangle",
    category: "critical",
    description: "Acknowledged and inferred limitations, ranked by impact."
  },
  {
    id: "reproducibility_blueprint",
    title: "Reproducibility & Implementation Blueprint",
    prompt:
      "Produce a reproduction plan as a checklist covering: data (sources, versions, preprocessing, splits); the model or procedure (components and sizes, in order); training (objective, optimiser, learning rate and schedule, batch size, epochs, seeds, initialisation); evaluation (metrics, protocol, test settings); compute (hardware and run time); and released code or checkpoints. Mark each item Reported, Partial, or Not found, quoting the value when reported. End with the three gaps most likely to block a faithful reproduction and a sensible default for each, labelled as an assumption.",
    icon: "FlaskConical",
    category: "methodology",
    description: "A reproduction checklist with every missing detail flagged."
  },
  {
    id: "background_related_work",
    title: "Background & Related Work",
    prompt:
      "Place the paper in its research context. Summarise the main lines of prior work it builds on or argues against, grouped by approach. State the gap in that work which this paper targets, in one or two sentences. Compare it with the two to four closest prior methods: what each does, and how this paper differs in approach, assumptions, or results. Finish with the prior works a reader should know to judge the contribution, named as the paper names them.",
    icon: "Library",
    category: "insights",
    description: "Prior work, the gap targeted, and the closest competing methods."
  },
  {
    id: "practical_applications",
    title: "Practical Applications & Deployment",
    prompt:
      "Assess what this work means in practice. Name the concrete use cases it fits best, and why. Describe what adopting it would take: data requirements, compute and memory, latency or throughput, integration with existing systems, and maintenance. Compare its cost and benefit with the usual alternative. Classify it as ready to use, needs engineering, or research only, and state the main risk in deployment. Keep what the paper demonstrates separate from your own extrapolation.",
    icon: "Rocket",
    category: "insights",
    description: "Use cases, adoption costs, and readiness for real use."
  },
  {
    id: "future_work",
    title: "Future Work & Open Problems",
    prompt:
      "Map the open problems this paper leaves. Include the directions the authors propose and those implied by its limitations or unexplained results, and label which is which. For each, explain why it matters, give a concrete next experiment (data, setup, and the result that would count as success), and rate its difficulty as Low, Medium, or High. End with the single most promising direction for a new research project, and why.",
    icon: "Compass",
    category: "insights",
    description: "Open problems with concrete next experiments and difficulty."
  }
];
