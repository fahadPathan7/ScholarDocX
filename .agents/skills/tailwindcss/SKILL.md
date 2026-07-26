---
name: tailwindcss
description: Use when implementing ScholarDocX UI with Tailwind CSS — layout, spacing, typography, responsive breakpoints, state variants, theming, and component composition. Adapts the MengTo/Skills tailwindcss playbook to the project's existing visual system.
---

# Tailwind CSS — Utility-first Styling Skill

> Adapted from [MengTo/Skills](https://github.com/MengTo/Skills) (`agent-skills/web-design/tailwindcss`). Scoped to ScholarDocX conventions.

## ScholarDocX First

This skill is **secondary** to the project's tuned visual system. Before applying any pattern below:

1. Read `AI-Context/technical/frontend-visual-system.md` (tokens, color scales, modal rules).
2. Respect the **Non-Negotiable UI Rules** in `AGENTS.md` — especially modal backdrop blur scoping.
3. Use the project's existing color tokens (e.g. the slateigo/indigo scale) rather than ad-hoc hex values, and never rename a project color token casually (a recent regression was a `slateigo` typo in a year switcher).

This skill provides generic recipes; the project's own rules win on conflict.

## When to use
- Rapid UI building with consistent spacing/typography scales.
- Component-driven work in the React/Vite frontend.
- Responsive layout adjustments (mobile/tablet/desktop) — directly relevant to the active mobile-responsiveness epic.

## Key concepts & patterns
- Utilities compose in JSX: `className="flex gap-4 p-6 bg-zinc-950 text-white"`.
- Responsive variants: `sm:` `md:` `lg:` `xl:` etc.
- State variants: `hover:`, `focus:`, `active:`, `disabled:`, `group-hover:`, `peer-checked:`.
- Arbitrary values (use sparingly): `w-[42rem]`, `bg-[#0b1220]`, `translate-y-[3px]`.
- Dark mode patterns: `dark:` with class-based strategy.
- Extracting repeated patterns:
  - Prefer React components first.
  - Then `@apply` for small reusable patterns (avoid overuse).

## Common pitfalls
- **Classes not generated in production** — ensure `content` paths include all templates/components; avoid building class names dynamically (e.g. `"text-" + color`) unless safelisted.
- **Dead selectors** — a recurring ScholarDocX regression (e.g. `.notes-grid` vs `.sticky-card-grid`). When fixing responsive CSS, confirm the class actually exists in the rendered markup before relying on it.
- **Overusing `@apply`** and losing utility-first benefits.
- **Huge className lists** — use `clsx`/`cva` or component composition; the codebase already has shared button/control components — reuse them.

## Quick recipes

### 1) A clean CTA button
```html
<button class="inline-flex items-center justify-center rounded-xl px-5 py-3
               bg-indigo-600 text-white font-medium
               hover:bg-indigo-500 active:bg-indigo-700
               focus:outline-none focus:ring-2 focus:ring-indigo-400/60">
  Get started
</button>
```

### 2) Responsive hero / section layout
```html
<section class="mx-auto max-w-6xl px-6 py-16">
  <div class="grid gap-10 lg:grid-cols-2 lg:items-center">
    <div>
      <h1 class="text-4xl font-semibold tracking-tight sm:text-5xl">Ship clean UI fast.</h1>
      <p class="mt-4 text-zinc-600">Tailwind helps you move quickly without fighting CSS.</p>
    </div>
    <div class="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <!-- media -->
    </div>
  </div>
</section>
```

### 3) Handling dynamic classnames safely
Prefer mapping over string concatenation:
```js
const toneClass = {
  success: "bg-emerald-600",
  danger: "bg-rose-600",
  info: "bg-sky-600",
}[tone];
```

## Done means
- Layout works across the project's breakpoints (mobile-first).
- No dynamic classnames that Tailwind can't see at build time.
- Existing project components/tokens reused before introducing new ones.
