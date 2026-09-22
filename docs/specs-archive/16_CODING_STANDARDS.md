# 16 — Coding Standards

## TypeScript

- `strict: true`
- no implicit any
- no blanket `as any`
- prefer discriminated unions
- use explicit return types for public application/port functions
- avoid unnecessary type-level complexity

## Naming

- classes: `PascalCase`
- functions/variables: `camelCase`
- constants: `UPPER_SNAKE_CASE` only for true constants
- use domain names, not technical names, in use cases

Examples:

```text
CreateSale
RecordCustomerPayment
SearchProducts
```

## Files

A file should have one cohesive responsibility.

Avoid:

```text
utils.ts
helpers.ts
misc.ts
common.ts
```

unless the contents are genuinely cohesive.

## React

- components should be small and composable
- keep business logic outside presentational components
- do not fetch directly from SQLite
- do not import Electron in React components
- isolate client-only APIs

## State

Keep only ephemeral UI/session state in Zustand or React state.

Persistent business state belongs in SQLite.

## Error handling

Map infrastructure errors to domain/application errors. The UI receives safe user-facing error codes/messages.

## SQL

- prepared statements only
- no SQL string concatenation with untrusted values
- keep schema/migrations in dedicated files
- do not scatter schema creation across unrelated services

## Comments

Comment why, not what.

Bad:

```ts
// increment i
i++;
```

Good:

```ts
// Invoice numbers are allocated inside the same transaction as sale creation
// so a retry cannot reuse a committed number.
```

## Dependency additions

Before adding a library, answer:

1. Why is the platform capability insufficient?
2. Why can the requirement not be implemented with existing dependencies?
3. Is the library maintained?
4. Does it introduce native modules?
5. Does it complicate packaging?
6. Does it materially improve reliability?

## Refactoring

Never mix large architecture rewrites with unrelated behavior changes in one unreviewed change.

Prefer small vertical slices:

```text
one feature
→ application contract
→ repository
→ database migration
→ UI
→ tests
```
