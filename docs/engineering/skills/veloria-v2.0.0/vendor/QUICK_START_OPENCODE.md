# Quick Start — OpenCode

## Project scope (recommended)

Copy this bundle's `.opencode/` directory into the root of the Veloria repository. Merge with any existing `.opencode/` content; do not overwrite custom agents/configuration.

Copy `governance/` and `templates/` into the repository after reviewing name conflicts.

## First session

Use a first request like:

> `@veloria-orchestrator` Audit the current repository against `governance/VELORIA_PROJECT_CONTRACT.md` and `governance/PROJECT_FACTS_TO_VERIFY.md`. Do not modify application code yet. Fill a verified baseline report, list conflicts/stale assumptions in the original skills, and propose prioritized corrections. Run only read-only checks unless a check creates temporary files in a safe disposable directory.

After the baseline review, use the orchestrator for changes.

## Explicit specialist loading

OpenCode skill IDs are path-derived and case-sensitive. These IDs match the folder names in this bundle. Skills are loaded on demand; their reference files are supporting context and should be read only when the skill tells the agent to do so.

## Validation

Run the Python package validator and unit tests before copying. After installation, mention a skill explicitly with `@skill-id` to confirm it is discoverable.
