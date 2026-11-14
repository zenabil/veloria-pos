---
name: veloria-ui-fr
description: "Build and review Veloria's French-only retail POS interface with robust rendering, accessible cashier workflows, typed bridge usage, DZD presentation, and consistent design-system behavior."
---

# Veloria UI FR — French interface and cashier experience

## Mission

Deliver a consistent, fast, understandable interface for daily retail work. The current product direction is French-only for POS UI and DZD for monetary display; verify any later user-approved change before extending localization.

## Inspect before editing

Read the actual routing/navigation model, component library, design tokens, form patterns, renderer-to-main bridge, state management, responsive breakpoints, testing stack, and current design references. Do not invent component names or assume the app uses a router.

## Renderer trust boundary

- Use only the project's typed, narrow bridge to call privileged operations.
- Never import Electron internals, Node APIs, SQLite, filesystem modules, or secrets into renderer code unless the current architecture explicitly permits a narrowly documented exception.
- Validate data crossing the bridge using the existing runtime schemas. Do not hide type mismatches with unchecked casts.
- Treat all user input and imported data as untrusted.

## Language and feedback

- All user-facing POS strings, dialogs, validation errors, empty states, tooltips, accessibility labels, and print-facing UI must follow the approved French terminology.
- Never display raw stack traces, SQL errors, HTTP responses, or exception messages.
- Give concise action-oriented errors and preserve detailed sanitized diagnostics in protected logs.
- Format numbers and dates consistently with the project's locale/business timezone contract. Money formatting must delegate to `veloria-money`.

## Cashier ergonomics

- Optimize high-frequency workflows for keyboard and barcode-scanner input, while retaining usable mouse/touch controls.
- Maintain predictable focus order, visible focus, dialog focus trapping, Escape/Enter behavior, and accessible labels.
- Make destructive or financially consequential actions explicit and confirmable; prevent accidental double submission.
- Provide clear loading, success, empty, offline, permission, and error states.
- Do not rely on color alone to communicate status.
- Keep tables readable at real data volumes; paginate, virtualize, or bound results when necessary.
- Preserve entered form data when a recoverable validation/network error occurs.

## Design-system discipline

- Reuse existing tokens, primitives, and patterns before adding new dependencies.
- Keep spacing, typography, iconography, contrast, focus, density, and empty-state behavior coherent.
- Avoid arbitrary inline styling and duplicated design primitives.
- Test realistic long names, large amounts, zero values, corrupted/missing fields, and narrow window sizes.

## Resilience and performance

- A bad optional display value must not crash an entire page. Use defensive formatting at read/render boundaries.
- Do not silently convert invalid write values into zero or a placeholder.
- Avoid rendering unbounded lists or repeatedly recalculating large derived datasets in component render paths.
- Keep forms responsive and prevent duplicate submissions while operations are pending.

## Required verification

- Test core flows with keyboard-only navigation and realistic cashier speed.
- Test French strings and number/date/money formatting.
- Test empty, loading, offline, invalid, and large-data cases.
- Run component and end-to-end tests against the real built Electron app when the change affects bridge behavior.
- Check visual consistency with existing components; do not alter brand/logo assets without explicit approval.

## Reference

- `references/design-system.md`
