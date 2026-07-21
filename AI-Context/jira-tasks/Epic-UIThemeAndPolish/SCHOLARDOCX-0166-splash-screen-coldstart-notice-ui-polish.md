# SCHOLARDOCX-0166: Splash Screen Cold Start Notice UI Polish

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-21

## Summary

Refine the splash screen cold-start notice ("The first load after a period of inactivity may take up to a minute while the server wakes up.") as a clean, subtle, borderless sub-line without icons or prominent visual focus, keeping the primary focus on the main loader bar and tips carousel.

## Business Context

Links:
- Business file: N/A

Business value:
- Provides necessary cold-start context without distracting or drawing unnecessary visual attention away from the primary brand elements.

## Functional Context

Links:
- Functional file: N/A

Requirements:
- Transform the plain text cold-start warning into a sleek, glassmorphic notice pill component.
- Add a subtle animated Lucide `Clock` icon wrapper with warm pulsing light effects.
- Ensure typography and alignment harmoniously align with the splash screen loader container.

## Technical Context

Links:
- Technical file: [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)

Technical notes:
- Update [SplashScreen.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/SplashScreen.tsx) to wrap the text in a pill container with a Lucide `Clock` icon.
- Update [splash-screen.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/splash-screen.css) with glassmorphism backdrop, soft borders, subtle hover glow, and icon pulse animation.

## Scope

In scope:
- Refactoring the cold start notice markup in `SplashScreen.tsx`.
- Styling `.splash-coldstart-pill`, `.splash-coldstart-icon-wrap`, and updating `.splash-message-secondary` in `splash-screen.css`.

Out of scope:
- Modifying backend server logic or Render deployment settings.

## Acceptance Criteria

- The cold-start notice is rendered inside a polished glassmorphic badge with an animated clock icon.
- Alignment with the loader bar and status message is visually consistent.
- `npm run build` succeeds cleanly in the frontend directory.

## Implementation Plan

- Edit `SplashScreen.tsx` to add `Clock` icon and wrap secondary message in `.splash-coldstart-pill`.
- Edit `splash-screen.css` to add pill styles, glassmorphism, pulse animation, and left alignment.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- This is a purely visual/markup UI refinement on a loading component without data mutations or complex state branches.

## File Size Check

Files expected to be edited:
- [SplashScreen.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/SplashScreen.tsx) (208 lines)
- [splash-screen.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/splash-screen.css) (273 lines)

Line-count risk:
- Low (both files are well under 1000 lines).

## Verification Plan

- Run `npm run build` in `frontend` directory to ensure zero build errors or TypeScript/JSX issues.

## Completion Notes

Changed files:

- [SplashScreen.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/SplashScreen.tsx)
- [splash-screen.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/splash-screen.css)
- [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)
- [SCHOLARDOCX-0166-splash-screen-coldstart-notice-ui-polish.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/jira-tasks/Epic-UIThemeAndPolish/SCHOLARDOCX-0166-splash-screen-coldstart-notice-ui-polish.md)

Verification completed:

- Executed `npm run build` in the `frontend` project workspace. Build completed with 0 errors and generated production bundle cleanly.

Unit tests added or updated:

- N/A (purely visual UI presentation update).

Follow-ups:

- None.
