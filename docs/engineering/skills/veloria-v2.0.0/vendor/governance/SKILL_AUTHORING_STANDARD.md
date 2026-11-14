# Skill Authoring Standard

## OpenCode-compatible format

- One directory per skill under `.opencode/skills/<skill-id>/`.
- One required `SKILL.md` with YAML frontmatter containing `name` and `description`.
- `name` must match the directory ID and use lowercase kebab-case.
- Keep descriptions concise and activation-focused (under 1024 characters).
- Put supporting material in `references/`; reference it explicitly from `SKILL.md`.
- Load references on demand instead of copying large reference documents into every prompt.

## Content standard

Every skill should define:

1. Mission and scope.
2. Activation conditions.
3. Mandatory repository discovery.
4. Trust boundaries and authoritative sources.
5. Non-negotiable rules.
6. Step-by-step workflow.
7. Failure/rollback behavior.
8. Tests and evidence.
9. Acceptance checklist.
10. References.

## Quality standard

- Instructions must be actionable, testable, and specific to the skill's domain.
- Avoid stale absolute paths, exact migration numbers, hardcoded counts, or guessed API names.
- Mark project-specific facts as “verify in repository” unless protected by an approved contract/ADR.
- No skill can override a user-approved product decision.
- No skill may ask an agent to claim work it did not perform.
- No skill may weaken tests or security checks merely to get a green result.
- Avoid overlapping ownership; use orchestrator for cross-domain routing.
- Review references whenever the primary skill changes.

## Versioning

- Patch: wording/clarity only; no behavior change.
- Minor: additive workflow/reference; backward-compatible.
- Major: changed authority, workflow, or required behavior.
- Record breaking changes and migration notes in the release notes.
