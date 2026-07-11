# Business Requirements

## BR-001: Secure Personal Workspace Privacy

All private application data must remain on the user's local machine by default.

Includes:

- Essays
- SOPs
- Research proposals
- LOR drafts
- Transcripts
- CVs
- Target universities
- Professor notes
- Outreach logs

## BR-002: Modular Application Organization

The product must support hierarchical organization:

Degree level -> geography -> institution -> program or professor.

The hierarchy must be flexible enough for Bachelor's, Master's, and PhD workflows.

## BR-003: Unified Global Dashboard

The user must be able to see cross-application progress from a top-level dashboard, regardless of hierarchy depth.

The dashboard should aggregate:

- Deadlines
- Application statuses
- Pending documents
- Pending emails
- Follow-up reminders

## BR-004: Integrated Document Playground

The product must include an internal rich-text drafting space for subjective academic documents.

Supported document types should include:

- SOP
- Research proposal
- LOR draft
- Cold email draft
- Personal statement
- Notes

## BR-005: External Document Storage

The product must support static document storage and linking for files created outside the app.

Examples:

- CVs from LaTeX, Overleaf, or Europass
- Transcripts
- Certificates
- Test score reports
- Writing samples

## BR-006: AI-Powered Strategic Assistance

The product should support AI-assisted research and drafting through GLM AI API and Tavily API.

AI support must help with:

- Professor research
- Publication summarization
- Hidden requirement discovery
- SOP and proposal feedback
- Email tone and structure refinement

## BR-007: Zero Required Infrastructure Cost

The app must run locally without requiring paid hosting, remote databases, or managed backend services.

External API usage may have provider costs, but the core app must remain usable without cloud infrastructure.

## BR-008: AI-DLC Maintainability

The repository must remain easy for AI coding assistants to understand, modify, and extend.

This requires:

- Context files
- Task files
- Stable module boundaries
- File-size limits
- Clear technical decisions
- Updated documentation before code changes

## BR-009: Optional Identity

Remote signup or signin must not be required for core local workflows unless a later explicit business decision changes the product direction.

Google OAuth can be supported as an optional identity provider when it creates clear value, such as Google Calendar, Gmail, or Drive integration.

## BR-010: Tiered Advisor Intelligence Usage

Advisor Atlas must use transparent monthly entitlements that reflect the cost
and depth of external professor research:

- General User: 3 searches or evidence refreshes per calendar month.
- Pro User: 10 searches or evidence refreshes per calendar month.
- Max User: 30 searches or evidence refreshes per calendar month.

The entitlement must be visible in plan comparison, role-limit administration,
and the user's current usage view.
