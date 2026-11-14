# Veloria UI design-system checklist

Inspect the project's real token files and component catalogue first. This document defines quality expectations, not fixed colors or component names.

## Visual language

- Reuse existing brand palette and do not redraw or replace the approved logo without explicit approval.
- Maintain clear hierarchy for page title, primary action, filters, data table, and contextual detail.
- Use consistent spacing, typography, icon weight, border radius, and elevation.
- Keep high-priority amounts and stock states legible without relying only on color.

## Interaction

- Keyboard focus is visible and follows a logical sequence.
- Dialogs restore focus to the invoking control when closed.
- Forms distinguish required/optional values and preserve recoverable input.
- Destructive actions require clear context and an intentional confirmation.
- Long-running operations show progress and cannot accidentally be double-submitted.

## Accessibility

- Controls have accessible names and appropriate roles.
- Text and interactive states have sufficient contrast.
- Status is expressed with text or icon plus color, not color alone.
- Tables and dialogs remain usable at supported window sizes and zoom levels.
- Errors are associated with the relevant form fields.

## French language quality

- Use consistent retail/accounting vocabulary approved by the product owner.
- Keep punctuation, capitalization, dates, and DZD formatting consistent.
- No raw technical exception text may reach the user.
