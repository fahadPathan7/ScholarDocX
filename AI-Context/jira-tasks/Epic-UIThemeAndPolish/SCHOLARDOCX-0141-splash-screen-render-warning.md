# SCHOLARDOCX-0141: Splash Screen UI Update and Render Sleep Notice

Status: Completed

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-07-16

## Summary

Update the splash screen (loading view) UI to gracefully handle Render's free tier sleep behavior (takes 1-2 minutes to boot). Add an interactive notice detailing the spin-up wait time and integrate a cycling tips/quotes component to keep the user engaged.

## Business Context

Links:
- Business file: N/A

Business value:
- Prevent users from thinking the application is frozen during Render sleep wake-up.
- Improve user retention and perceived application quality by providing contextual hints and engaging academic tips during boot-up.

## Functional Context

Links:
- Functional file: N/A

Requirements:
- Add a clear explanation on the loading screen that booting the server takes 1-2 minutes on Render's free tier.
- Add a cycling tips and quotes animation component to entertain users while they wait.
- Polish the loading UI with high-quality visual styling and smooth transitions.

## Technical Context

Links:
- Technical file: [frontend-visual-system.md](file:///Users/fahadpathan/Documents/ScholarDocX/AI-Context/technical/frontend-visual-system.md)

Technical notes:
- Update [SplashScreen.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/SplashScreen.tsx) to add the Render sleep notice and cycling quotes state.
- Update [splash-screen.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/splash-screen.css) with rich animations (pulsing lights, smooth tip fades) to keep it high-fidelity.
- Make the quotes cycle every 5-6 seconds with CSS transition opacity classes or react state triggers.

## Scope

In scope:
- Update `SplashScreen.tsx` component layout and states.
- Update `splash-screen.css` styles.
- Create engaging quotes/tips list.
- Add explanation regarding Render free tier inactivity spin-up.

Out of scope:
- Modifying backend server logic or Render deployment settings.

## Acceptance Criteria

- Splash screen UI contains an elegant notice stating the server may take 1-2 minutes to boot if it was sleeping.
- A cycling list of tips and quotes renders below the loader, transitioning smoothly every 5 seconds.
- The UI matches the high-end dark glassmorphic design theme of ScholarDocX.

## Implementation Plan

- Edit `SplashScreen.tsx` to implement a `currentTip` state and a `useEffect` interval to cycle tips.
- Edit `splash-screen.css` to add formatting for the notices, tip transitions, and pulsating animations.

## Unit Test Plan

Unit tests needed:
- No

If no unit tests are needed, explain why:
- This is a purely visual/copy change on a loading component with no data-modifying actions or business-logic branches.

## File Size Check

Files expected to be edited:
- [SplashScreen.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/SplashScreen.tsx) (current lines: 60)
- [splash-screen.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/splash-screen.css) (current lines: 229)

Line-count risk:
- Low (both files are well under the 1000 lines limit)

## Verification Plan

- Check the React component compilation.
- Manually check the visual look of the splash screen page.
- Verify the quotes rotate correctly.

## Completion Notes

Changed files:

- [SplashScreen.tsx](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/SplashScreen.tsx)
- [splash-screen.css](file:///Users/fahadpathan/Documents/ScholarDocX/frontend/src/components/splash-screen.css)

Verification completed:

- Verified via `npm run build` inside the `frontend` folder (production bundle built successfully with no errors).

Unit tests added or updated:

- None (purely visual/copy presentation changes, not covered by unit tests).

Follow-ups:

- None.
