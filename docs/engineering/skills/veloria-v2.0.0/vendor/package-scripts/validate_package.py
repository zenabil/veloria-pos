#!/usr/bin/env python3
"""Validate structural integrity of the Veloria Engineering Skills package."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = ROOT / ".opencode" / "skills"
EXPECTED_COUNT = 17
NAME_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def parse_frontmatter(text: str, skill_id: str):
    if not text.startswith("---\n"):
        fail(f"{skill_id}: SKILL.md does not start with YAML frontmatter")
    try:
        end = text.index("\n---\n", 4)
    except ValueError:
        fail(f"{skill_id}: closing frontmatter delimiter not found")
    block = text[4:end]
    name_match = re.search(r"(?m)^name:\s*([^\s]+)\s*$", block)
    desc_match = re.search(r'(?m)^description:\s*"(.*)"\s*$', block)
    if not name_match or not desc_match:
        fail(f"{skill_id}: frontmatter requires name and quoted description")
    name = name_match.group(1)
    description = desc_match.group(1)
    if name != skill_id:
        fail(f"{skill_id}: frontmatter name '{name}' does not match folder")
    if not NAME_RE.fullmatch(name):
        fail(f"{skill_id}: invalid skill ID '{name}'")
    if not description.strip() or len(description) > 1024:
        fail(f"{skill_id}: description must contain 1..1024 characters")
    return end + 5


def main() -> None:
    if not SKILLS_ROOT.is_dir():
        fail(".opencode/skills directory missing")
    folders = sorted(p for p in SKILLS_ROOT.iterdir() if p.is_dir())
    if len(folders) != EXPECTED_COUNT:
        fail(f"expected {EXPECTED_COUNT} skill directories, found {len(folders)}")
    seen = set()
    references_checked = 0
    for folder in folders:
        skill_id = folder.name
        if skill_id in seen:
            fail(f"duplicate skill ID: {skill_id}")
        seen.add(skill_id)
        skill_file = folder / "SKILL.md"
        if not skill_file.is_file():
            fail(f"{skill_id}: missing SKILL.md")
        text = skill_file.read_text(encoding="utf-8")
        body_start = parse_frontmatter(text, skill_id)
        body = text[body_start:]
        if len(body.strip()) < 400:
            fail(f"{skill_id}: SKILL.md body unexpectedly short")
        # Validate all explicit relative reference links and references named in prose.
        refs = set(re.findall(r"(?:references/)([A-Za-z0-9_.-]+\.md)", body))
        for ref in refs:
            ref_path = folder / "references" / ref
            if not ref_path.is_file():
                fail(f"{skill_id}: referenced file missing: references/{ref}")
            if ref_path.stat().st_size < 80:
                fail(f"{skill_id}: reference file is unexpectedly small: {ref}")
            references_checked += 1
    required = {
        "veloria-orchestrator", "veloria-db", "veloria-money", "veloria-stock",
        "veloria-electron", "veloria-ui-fr", "veloria-slice", "veloria-gates",
        "veloria-closing", "veloria-license", "veloria-sync", "veloria-release",
        "veloria-backup", "veloria-printing", "veloria-security", "veloria-hardware",
        "veloria-observability",
    }
    missing = required - seen
    if missing:
        fail("missing required skills: " + ", ".join(sorted(missing)))
    for relative in [
        "governance/VELORIA_PROJECT_CONTRACT.md",
        "governance/PROJECT_FACTS_TO_VERIFY.md",
        "governance/SKILLS_REGISTRY.md",
        "governance/CHANGE_IMPACT_MATRIX.md",
        "governance/SKILL_AUTHORING_STANDARD.md",
        "archive/original-skills-v1.zip",
    ]:
        path = ROOT / relative
        if not path.is_file() or path.stat().st_size == 0:
            fail(f"required package file missing/empty: {relative}")
    print("PASS: package structure is valid")
    print(f"PASS: {len(folders)} OpenCode skills")
    print(f"PASS: {references_checked} referenced Markdown files")
    print("NOTE: structural validation does not validate the Veloria application repository")


if __name__ == "__main__":
    main()
