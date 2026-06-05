import { ReactNode } from "react";

type SectionProps = {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Section({ title, eyebrow, action, children, className }: SectionProps) {
  return (
    <section className={className ? `section ${className}` : "section"}>
      <div className="section-head">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action}
      </div>
      <div className="section-body">
        {children}
      </div>
    </section>
  );
}
