import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { useReveal } from "./useReveal";
import "./FaqSection.css";

type QA = { q: string; a: string; category?: string };

const FAQS: QA[] = [
  {
    category: "OVERVIEW",
    q: "What is ScholarDocX?",
    a: "ScholarDocX is a secure personal workspace designed specifically for graduate and higher education applicants. It combines program mapping, deadline tracking, AI paper analysis, advisor vetting, and focus tools into one unified platform.",
  },
  {
    category: "SECURITY & PRIVACY",
    q: "Is my data private?",
    a: "Yes. Privacy is our top priority. We use strict access controls within our cloud boundaries, ensuring each user's workspace and documents are isolated using Row-Level Security. Your research notes, CVs, and uploaded PDFs are never exposed or shared with third parties.",
  },
  {
    category: "CORE POWER TOOLS",
    q: "How do Research Expert, Advisor Atlas, and Focus Games work together?",
    a: "They form your complete academic application engine: Research Expert analyzes uploaded papers and refines your proposal fit, Advisor Atlas scores research alignment with faculty and provides verified emails, and Focus Games offer 2-minute cognitive micro-breaks (2048, Sudoku, Pattern Memory, Minesweeper, Word Puzzle, TicTacToe) to keep your mind sharp between drafting sessions.",
  },
  {
    category: "AI ASSISTANT",
    q: "How does the AI assistant help with my applications?",
    a: "Our contextual AI assistant helps you draft personalized outreach emails to professors, synthesize complex academic literature, and refine your statement of purpose based on your specific research interests and target programs.",
  },
  {
    category: "PROGRAM MANAGEMENT",
    q: "Can I manage applications for multiple universities?",
    a: "Yes. ScholarDocX is engineered to handle multiple applications simultaneously. You can create customized tracker sheets for each program, ensuring you never miss a requirement or deadline.",
  },
  {
    category: "DATA EXPORT",
    q: "Can I export my application data and tracking sheets?",
    a: "Yes. You can export your application tracker sheets (CSV), generated outreach emails, and document summaries at any time. Your data belongs to you.",
  },
  {
    category: "PRICING & TRIALS",
    q: "Do I need a credit card to get started?",
    a: "No credit card is required. You can start for free on our Free plan, which includes 1 project workspace, 5 MB document storage, and 500 monthly AI credits to test out all core features.",
  },
  {
    category: "GETTING STARTED",
    q: "How do I get started with my first application workspace?",
    a: "Simply create a free account, set up your first project workspace, add your target programs, and start tracking deadlines and paper research immediately. Guided workflows will help you set up your first application tracker in minutes.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const headerRef = useReveal<HTMLDivElement>();

  return (
    <section id="faq" className="lp-faq-section">
      <div className="reveal text-center" ref={headerRef}>
        <div className="lp-faq-top-chip">
          <HelpCircle size={14} />
          <span>Got Questions?</span>
        </div>
        <h2 className="lp-section-title">
          Frequently Asked Questions
        </h2>
        <p className="lp-section-subtitle">
          Everything you need to know before getting started with ScholarDocX.
        </p>
      </div>

      <div className="lp-faq-list">
        {FAQS.map((item, i) => (
          <FaqItem
            key={item.q}
            item={item}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          />
        ))}
      </div>
    </section>
  );
}

function FaqItem({
  item,
  isOpen,
  onToggle,
}: {
  item: QA;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div className="reveal" ref={ref}>
      <div className={`lp-faq-item${isOpen ? " is-open" : ""}`}>
        <button
          type="button"
          className="lp-faq-question"
          aria-expanded={isOpen}
          onClick={onToggle}
        >
          <div className="lp-faq-q-left">
            {item.category && <span className="lp-faq-cat-tag">{item.category}</span>}
            <span>{item.q}</span>
          </div>
          <ChevronDown size={18} className="lp-faq-chevron" />
        </button>
        <div className="lp-faq-answer-wrap">
          <div className="lp-faq-answer-inner">
            <p className="lp-faq-answer">{item.a}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
