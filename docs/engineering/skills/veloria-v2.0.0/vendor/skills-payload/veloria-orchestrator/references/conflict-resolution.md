# Conflict resolution protocol

1. Quote the conflicting rule or implementation fact precisely, with its source file/line where possible.
2. Classify it as user decision, accepted ADR, executable behavior, stale documentation, skill instruction, or assumption.
3. Apply the authority order in the orchestrator. Do not use commit recency alone to override a user-approved decision.
4. If the decision is clear, implement the correction and update every dependent document/test in the same change.
5. If two approved user decisions conflict, stop before changing behavior and ask one narrow question.
6. Record material architecture changes in an ADR using `templates/ADR_TEMPLATE.md`.
7. Add a regression test proving the old failure cannot recur.

Never resolve a conflict by deleting a failing test, weakening a security gate, silently changing a data contract, or introducing a second source of truth.
