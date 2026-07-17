import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useReveal } from "./useReveal";
import "./FaqSection.css";

type QA = { q: string; a: string };

const FAQS: QA[] = [
  {
    q: "What is ScholarDocX?",
    a: "ScholarDocX is a secure workspace designed specifically for graduate and higher education applicants. It provides tools for program mapping, deadline tracking, email logging, research whiteboards, and context-integrated AI writing assistance.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Privacy is our top priority. We use strict data access policies within our cloud boundaries, separating each user's records. Your uploaded documents and personal research notes are never exposed or shared with other accounts.",
  },
  {
    q: "How does the AI assistant help?",
    a: "Our contextual AI assistant is designed to streamline your application process. It helps you draft professional outreach emails to professors, synthesize complex academic literature, and refine your statement of purpose, all while keeping your specific research goals in mind.",
  },
  {
    q: "Can I manage applications for multiple universities?",
    a: "Yes. ScholarDocX is designed to handle multiple applications simultaneously. You can create customized tracker sheets for each program, ensuring you never miss a deadline or requirement.",
  },
  {
    q: "Can I export my application data?",
    a: "Yes, you can export your application tracking sheets and generated documents at any time. We believe your data belongs to you, so we make it easy to export your information to standard formats.",
  },
  {
    q: "How do I get started?",
    a: "Simply create an account and you can begin mapping out your target universities immediately. We provide templates and guided workflows to help you set up your first application tracker in minutes.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const headerRef = useReveal<HTMLDivElement>();

  return (
    <section id="faq" className="lp-faq-section">
      <div className="reveal" ref={headerRef}>
        <h2 className="lp-section-title">Frequently Asked Questions</h2>
        <p className="lp-section-subtitle">
          Everything you need to know before getting started.
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
          <span>{item.q}</span>
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
