# SCHOLARDOCX-0230: Align in-app look with the landing page

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

After the landing redesign (0223) the app (teal, cool green-white, sans titles)
read as a different product. Owner approved a light alignment, not a retheme.

## Changes

New `frontend/src/app-brand.css`: ivory canvas + warm line tokens, serif display
font for headings/wordmark/tagline, gold active-nav marker, gold Pro badge,
gold text selection. No component markup changed.

## Verification

tsc + build; Playwright (mocked API) screenshots of Dashboard and Profile at
1470x900 and clipping audit on Dashboard/Profile/Documents/About (no clipped
containers). Other pages not visually reviewed: look for low-contrast text on
the warmer canvas and serif headings that wrap awkwardly.

## Not done (deliberately)

Teal buttons/links stay teal; ink-navy buttons were offered as an optional
later step.
