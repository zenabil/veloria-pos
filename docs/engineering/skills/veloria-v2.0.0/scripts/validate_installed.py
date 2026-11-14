#!/usr/bin/env python3
"""Validate the Veloria skills INSTALLED in the repository.

This is the post-install counterpart of the package's own
``scripts/validate_package.py``. The package validator proves the ARCHIVE is
well formed; this one proves the tree that OpenCode actually loads
(``<repo>/.opencode/skills``) is well formed and carries no stale copy.

It applies:
  * every structural rule of the package validator (count, SKILL.md, frontmatter,
    name == folder, description length, body length, referenced files present);
  * the project's own Agent Skills gate rules
    (``scripts/quality/verify-docs.mjs`` section 3.5);
  * a duplicate-Skill-ID check;
  * a stale-file check: every file under the installed tree must exist in the
    audited payload (``skills-payload/``), so no pre-migration file survives.

Usage:
    python scripts/validate_installed.py [--repo-root <path>]
"""
from pathlib import Path
import argparse
import re
import sys

EXPECTED_COUNT = 17
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

REQUIRED = {
    "veloria-orchestrator", "veloria-db", "veloria-money", "veloria-stock",
    "veloria-electron", "veloria-ui-fr", "veloria-slice", "veloria-gates",
    "veloria-closing", "veloria-license", "veloria-sync", "veloria-release",
    "veloria-backup", "veloria-printing", "veloria-security", "veloria-hardware",
    "veloria-observability",
}

# Mirror of FORBIDDEN_LITERALS_SKILLS in scripts/quality/verify-docs.mjs.
FORBIDDEN_LITERALS_SKILLS = [
    (re.compile(r"prochain\s+numéro\s+après\s+`?0051", re.I), "la dernière migration est 0062 (prochaine : 0063)"),
    (re.compile(r"ADR-135"), "index ADR périmé (cf. docs/METRICS.md)"),
    (re.compile(r"(?<![a-z/])PHASE_X_REPORT\.md"), "les rapports de phase vont dans docs/reports/ (ADR-058)"),
    (re.compile(r"169 fichiers"), "compteur de tests figé"),
    (re.compile(r"1[\u202f ]?146 tests", re.I), "compteur de tests figé"),
    (re.compile(r"typecheck ×3"), "le script check fait 5 typecheck"),
    (re.compile(r"0001\.\.0056"), "plage de migrations figée"),
    (re.compile(r"\b\d{2,4}\s+(?:fichiers|canaux|cas|migrations|tables|agents|compétences)\b"),
     "compteur vivant recopié — renvoie à docs/METRICS.md"),
    (re.compile(r"prochain\s*(?:numéro\s+de\s+migration|migration|ADR)?\s*[:=]?\s*`?0\d{3}", re.I),
     "un « prochain numéro » figé se périme"),
    (re.compile(r"prochain\s*[:=]?\s*ADR-\d+", re.I), "un « prochain ADR » figé se périme"),
]


def find_repo_root(start: Path) -> Path:
    for candidate in [start, *start.parents]:
        if (candidate / ".opencode" / "skills").is_dir():
            return candidate
    raise SystemExit(f"ABORT: no .opencode/skills found from {start}")


def parse_frontmatter(text: str, skill_id: str, failures: list) -> int:
    if not text.startswith("---\n"):
        failures.append(f"{skill_id}: SKILL.md does not start with YAML frontmatter")
        return 0
    try:
        end = text.index("\n---\n", 4)
    except ValueError:
        failures.append(f"{skill_id}: closing frontmatter delimiter not found")
        return 0
    block = text[4:end]
    name_match = re.search(r"(?m)^name:\s*([^\s]+)\s*$", block)
    desc_match = re.search(r'(?m)^description:\s*"(.*)"\s*$', block)
    if not name_match or not desc_match:
        failures.append(f"{skill_id}: frontmatter requires name and quoted description")
        return 0
    name = name_match.group(1)
    description = desc_match.group(1)
    if name != skill_id:
        failures.append(f"{skill_id}: frontmatter name '{name}' does not match folder")
    if not NAME_RE.fullmatch(name):
        failures.append(f"{skill_id}: invalid skill ID '{name}'")
    if not description.strip() or len(description) > 1024:
        failures.append(f"{skill_id}: description must contain 1..1024 characters")
    return end + 5


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo-root", default=None)
    args = ap.parse_args()

    here = Path(__file__).resolve()
    repo = Path(args.repo_root).resolve() if args.repo_root else find_repo_root(here)
    skills_root = repo / ".opencode" / "skills"
    payload = here.parents[1] / "vendor" / "skills-payload"

    failures: list = []
    notes: list = []

    if not skills_root.is_dir():
        raise SystemExit(f"ABORT: {skills_root} not found")

    folders = sorted(p for p in skills_root.iterdir() if p.is_dir())
    notes.append(f"installed skill folders: {len(folders)}")
    if len(folders) != EXPECTED_COUNT:
        failures.append(f"expected {EXPECTED_COUNT} skill directories, found {len(folders)}")

    seen = set()
    references_checked = 0
    for folder in folders:
        skill_id = folder.name
        if skill_id in seen:
            failures.append(f"duplicate skill ID: {skill_id}")
        seen.add(skill_id)
        skill_file = folder / "SKILL.md"
        if not skill_file.is_file():
            failures.append(f"{skill_id}: missing SKILL.md")
            continue
        text = skill_file.read_text(encoding="utf-8")
        body_start = parse_frontmatter(text, skill_id, failures)
        body = text[body_start:]

        if len(body.strip()) < 400:
            failures.append(f"{skill_id}: SKILL.md body unexpectedly short")
        if len(body.split("\n")) < 15:
            failures.append(f"{skill_id}: SKILL.md body too short (< 15 lines)")

        for pattern, why in FORBIDDEN_LITERALS_SKILLS:
            m = pattern.search(text)
            if m:
                failures.append(f"{skill_id}: stale literal '{m.group(0)}' - {why}")

        refs = set(re.findall(r"(?:references/)([A-Za-z0-9_.-]+\.md)", body))
        for ref in refs:
            ref_path = folder / "references" / ref
            if not ref_path.is_file():
                failures.append(f"{skill_id}: referenced file missing: references/{ref}")
            else:
                references_checked += 1
                if ref_path.stat().st_size < 80:
                    failures.append(f"{skill_id}: reference file is unexpectedly small: {ref}")
        for m in re.finditer(r"\]\((?!https?:|#)([^)\s]+)\)", body):
            target = m.group(1)
            if not (folder / target).exists():
                failures.append(f"{skill_id}: broken markdown link: {target}")

    missing = REQUIRED - seen
    if missing:
        failures.append("missing required skills: " + ", ".join(sorted(missing)))

    # No stale file may survive from the pre-migration tree.
    if payload.is_dir():
        payload_files = {
            str(p.relative_to(payload)).replace("\\", "/") for p in payload.rglob("*") if p.is_file()
        }
        installed_files = {
            str(p.relative_to(skills_root)).replace("\\", "/") for p in skills_root.rglob("*") if p.is_file()
        }
        stale = installed_files - payload_files
        if stale:
            failures.append("stale files not present in the audited payload: " + ", ".join(sorted(stale)))
        else:
            notes.append(f"no stale file: {len(installed_files)} installed files all come from the payload")
        missing_payload = payload_files - installed_files
        if missing_payload:
            failures.append("payload files not installed: " + ", ".join(sorted(missing_payload)))
        else:
            notes.append(f"payload fully installed: {len(payload_files)} files")
    else:
        notes.append(f"audited payload not found at {payload} - stale-file check skipped")

    # Governance and templates must exist at the repository root.
    for rel in [
        "governance/VELORIA_PROJECT_CONTRACT.md",
        "governance/SKILLS_REGISTRY.md",
        "governance/SKILL_AUTHORING_STANDARD.md",
        "governance/CHANGE_IMPACT_MATRIX.md",
        "governance/PROJECT_FACTS_TO_VERIFY.md",
        "templates/ADR_TEMPLATE.md",
        "templates/TASK_BRIEF_TEMPLATE.md",
        "templates/RELEASE_NOTES_TEMPLATE.md",
    ]:
        path = repo / rel
        if not path.is_file() or path.stat().st_size == 0:
            failures.append(f"required governance/template missing or empty: {rel}")
    notes.append("governance and templates checked at repository root")

    for n in notes:
        print(f"OK  {n}")
    if failures:
        for f in failures:
            print(f"FAIL  {f}")
        print(f"\n{len(failures)} failure(s) - installed skills tree is NOT valid.")
        raise SystemExit(1)
    print(f"PASS: {len(folders)} OpenCode skills installed and valid")
    print(f"PASS: {references_checked} referenced Markdown files resolved")
    print("NOTE: structural validation does not validate the Veloria application repository")


if __name__ == "__main__":
    main()
