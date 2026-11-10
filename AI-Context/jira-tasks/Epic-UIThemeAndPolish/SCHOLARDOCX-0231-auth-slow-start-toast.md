# SCHOLARDOCX-0231: Replace inline "first load may take a minute" note with a toast

Status: Done

Owner: AI Agent

Epic: Epic-UIThemeAndPolish

Created: 2026-11-10

## Summary

The inline note under Log In / Create Account / Submit Request / Google buttons
was oddly placed and easy to miss. Replaced by a self-dismissing toast.

## Changes

New `SlowStartToast` (shows when `show` turns true, hides after 6s, re-arms on
the next false→true). Removed 6 inline notes (LoginPage x3, RegisterPage,
GoogleAuthButton) and the `.auth-loading-note` CSS; added `.auth-toast` styles.
Login covers login + invite request + forgot password via one toast.

## Verification

tsc; Playwright with a delayed mocked API: toast visible at 0.8s, gone by 7.3s
while the button is still loading; no inline note rendered.
