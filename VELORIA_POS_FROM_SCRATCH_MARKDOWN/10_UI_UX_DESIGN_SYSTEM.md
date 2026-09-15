# 10 — UI/UX Design System

## Design goal

The UI should feel like a polished Windows business application rather than a generic website inside Electron.

## Visual language

Use a restrained professional system:

- clear hierarchy
- compact data-dense layouts
- comfortable touch targets
- subtle elevation
- high contrast
- consistent borders/radii
- restrained animation
- predictable focus states

Brand styling may use the existing Veloria identity, but the component system must remain neutral and functional.

## Layout

### Application shell

One canonical shell:

```text
┌────────────────────────────────────────────────────────────┐
│ Brand / page title | search/context | alerts | settings   │
├───────────────┬────────────────────────────────────────────┤
│ Navigation    │                                            │
│               │              Page Content                  │
│ Dashboard     │                                            │
│ Vente         │                                            │
│ Produits      │                                            │
│ Clients       │                                            │
│ Stock         │                                            │
│ Historique    │                                            │
│ Retours       │                                            │
│ Dépenses      │                                            │
│ Rapports      │                                            │
│ ...           │                                            │
└───────────────┴────────────────────────────────────────────┘
```

For smaller windows, the navigation collapses to a compact rail or command menu instead of introducing a second unrelated navigation system.

## Primary sales screen

Optimize the checkout page for keyboard and barcode workflows.

Recommended order:

1. product search / barcode input
2. result list
3. cart
4. customer selector
5. discount/delivery controls
6. totals and payment action
7. confirmation/print

The operator should be able to complete common sales without reaching for a mouse.

## Design tokens

Define tokens for:

- spacing
- typography
- radius
- border widths
- shadows
- focus ring
- status colors
- surface colors
- text colors

Use CSS variables and Tailwind tokens rather than scattered arbitrary values.

## Accessibility

Minimum:

- visible keyboard focus
- semantic labels
- dialog titles/descriptions
- sufficient color contrast
- keyboard operation for menus/dialogs
- screen-reader labels for icon-only buttons
- non-color status indication
- reduced-motion support

## Tables

Tables must support:

- sticky headers where useful
- column alignment
- numeric alignment
- row actions
- pagination
- empty/loading/error states
- keyboard focus

## Dialogs

Every modal needs:

- meaningful title
- concise description
- predictable focus trap
- Escape behavior
- explicit destructive-action confirmation
- disabled/loading state during mutation

## Forms

Use consistent patterns for:

- labels
- helper text
- error text
- numeric fields
- date pickers
- currency formatting
- validation timing

## Notifications

Use non-blocking toast notifications for success/informational feedback and inline field errors for input errors.

Critical failures should show a recovery path rather than just a toast.

## French text policy

The application UI is French-only.

Examples:

- `Nouvelle vente`
- `Produits`
- `Clients`
- `Stock`
- `Historique des ventes`
- `Retours`
- `Dépenses`
- `Rapports`
- `Paramètres`

Do not leak:

- debug English
- raw exception strings
- placeholder English
- untranslated accessibility text

## Desktop breakpoints

Design and test at minimum:

- 1280×720
- 1366×768
- 1600×900
- 1920×1080
- 2560×1440

Avoid horizontal page scrolling unless explicitly required by a wide data table.
