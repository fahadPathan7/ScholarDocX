# Feature: Email And Outreach

Requirement group: FR-4

## Goal

Users can draft, customize, link attachments, and track academic outreach emails.

## Template Engine

Email templates should support parameters such as:

- Professor name
- University name
- Program name
- Intake term
- Research area
- Applicant name
- Attached document list

## Email Drafts

An email draft can be connected to:

- Professor
- Program
- University
- Application
- Document version
- Static attachments

## Sending Options

MVP-preferred options:

- Copy finalized email body.
- Open default mail client with a `mailto:` link.
- Open Gmail or Outlook web compose with `to`, `subject`, and `body` prefilled.
- Store scheduled send time as a local reminder/notification.

Optional later option:

- Local SMTP configuration.
- Gmail API or Microsoft Graph integration for true provider-side scheduling and automatic attachments.

SMTP should not be assumed for MVP unless a Jira task explicitly includes it.

Important limitation:

Ordinary Gmail/Outlook compose URLs cannot automatically attach secure files. The MVP can show attachment paths for the user to attach manually.

## Outreach Log

Track:

- Recipient
- Subject
- Sent date
- Related application
- Related professor
- Attachments used
- Follow-up date
- Response status

## Follow-Up Reminders

Users can set reminders based on:

- Manual date
- X days after sent date

Reminder items should appear in the dashboard and timeline.
