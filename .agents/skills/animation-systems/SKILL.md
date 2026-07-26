---
name: animation-systems
description: Use when designing or implementing product-grade web motion in ScholarDocX (Stripe/Linear/Apple/Vercel style) — entrance, hover, scroll, modal, and feedback motion. Covers principles, duration/easing defaults, choreography, performance, and reduced-motion. Adapts the MengTo/Skills animation-systems playbook.
---

# Animation Systems (Stripe × Linear × Apple × Vercel)

> Adapted from [MengTo/Skills](https://github.com/MengTo/Skills) (`agent-skills/web-design/animation-systems`). Scoped to ScholarDocX conventions.

This skill helps ship **tasteful, product-grade motion**. Not "more animation" — **better animation**: clarity, hierarchy, feedback, and delight, without jank.

## ScholarDocX First

ScholarDocX is a productivity portal (tables, modals, forms, dashboards), not a marketing site. Bias toward **restraint**:

- Motion should serve feedback and hierarchy, never decoration.
- Do not introduce WebGL, heavy parallax, cinematic scroll-scrub, or 3D — these conflict with the project's utility focus and performance budget (Render free tier).
- Existing CSS transitions in components take precedence; layer new motion tokens rather than rewriting.
- The **Non-Negotiable UI Rules** in `AGENTS.md` (modal backdrop blur) are not negotiable for the sake of a motion idea.

## The goals (why motion exists)
Use animation to:
1. **Explain hierarchy** (what matters).
2. **Confirm action** (feedback).
3. **Guide attention** (where to look next).
4. **Maintain continuity** (spatial relationships).
5. **Add polish** (craft signals).

If an animation doesn't serve one of these, delete it.

## Shared style traits
1. **Restraint** — fewer animations, better chosen. One strong moment; the rest is supporting motion.
2. **Clear choreography** — primary element moves first; secondary elements follow with small stagger; motion establishes a reading order.
3. **Physical but not cartoony** — easing that feels human (soft acceleration + gentle settle). Avoid bouncy defaults for serious product UI.
4. **Texture + depth (subtle)** — small parallax, soft shadows, blur fades. Avoid heavy 3D unless it's the hero (and ScholarDocX has no hero).

## Motion primitives (build these first)

### A) Fade + rise (default entrance)
For text blocks, cards, modals.
- Opacity: 0 → 1
- Y: 12–24px → 0
- Duration: 300–700ms depending on size

### B) Scale + fade (micro emphasis)
For popovers, toasts, selected states.
- Scale: 0.98 → 1
- Opacity: 0 → 1

### C) Slide (navigation)
For drawers, step transitions.
- Use `transform` translate; avoid animating layout.

### D) Morph / shared element (high craft)
For tab indicators, expanding cards.
- Requires consistent geometry + measured layout.

## Defaults (practical numbers)

### Durations
- Micro (hover/press): **120–200ms**
- UI state change (toggle, select): **180–260ms**
- Small transitions (popover, toast): **220–320ms**
- Page section entrance: **400–800ms**
- Hero sequences: **800–1600ms** (with internal beats)

### Easing (safe set)
- UI: **ease-out** with gentle settle.
- Emphasis: slightly stronger ease.
- Entering: ease-out. Exiting: ease-in (faster).
- Avoid elastic/bounce unless the brand is playful (it isn't here).

### Stagger
- 40–90ms per element (text lines/cards).
- Use smaller stagger on mobile.

## Choreography patterns
1. **Hero → supporting elements** — hero visual first, headline next, CTA last.
2. **Section reveal on scroll** — trigger when ~20–30% visible; animate once.
3. **Hover: lift + glow** — Y: -2 to -6px; subtle shadow increase; optional border/gradient glow.
4. **Focus ring + micro shift** — for form fields: focus ring + tiny scale/translate.

## Performance rules (non-negotiable)

### Animate the right properties
- Prefer: `transform` (translate/scale/rotate), `opacity`.
- Avoid: width/height/top/left, expensive filters on large areas.

### Respect the GPU
- Keep blur subtle and small.
- Avoid many simultaneous animated shadows.

### Reduce reflows
- Don't measure layout every frame.
- For scroll effects, use a library that batches reads/writes.

## Accessibility: Reduced Motion
Always support `prefers-reduced-motion`.
- Keep content visible.
- Replace motion with instant state + subtle opacity.
- Disable scroll-scrub/pin.

## Implementation guidance
- Simple toggles/hovers: CSS transitions.
- Complex sequences: one motion library (the project does not currently standardize one — propose before adding).
- Create a motion token set: durations, easing curves, standard offsets (8/16/24px), stagger defaults.

## Done means
- Motion serves one of the five goals above.
- Only `transform`/`opacity` animated.
- `prefers-reduced-motion` respected.
- No new heavy dependencies without explicit approval (project rule).
