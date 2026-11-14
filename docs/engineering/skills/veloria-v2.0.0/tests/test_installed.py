"""Post-install tests for the Veloria Engineering Skills v2.0.0 deployment.

These mirror the assertions of the package's own `tests/test_package.py`, but
they are applied to the tree OpenCode actually loads
(`<repo>/.opencode/skills`) instead of to the extracted archive.

Run from this folder:
    python -m unittest discover -s tests -v
"""
import re
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]      # docs/engineering/skills/veloria-v2.0.0
REPO = HERE.parents[3]                            # repository root
SKILLS = REPO / ".opencode" / "skills"
GOVERNANCE = REPO / "governance"
TEMPLATES = REPO / "templates"
PAYLOAD = HERE / "vendor" / "skills-payload"


class InstalledSkillsTests(unittest.TestCase):
    def test_exactly_seventeen_skills_installed(self):
        folders = [p for p in SKILLS.iterdir() if p.is_dir()]
        self.assertEqual(len(folders), 17, [p.name for p in folders])

    def test_every_installed_skill_has_matching_frontmatter(self):
        for folder in sorted(p for p in SKILLS.iterdir() if p.is_dir()):
            content = (folder / "SKILL.md").read_text(encoding="utf-8")
            self.assertTrue(content.startswith("---\n"), folder.name)
            name = re.search(r"(?m)^name:\s*([^\s]+)$", content)
            desc = re.search(r'(?m)^description:\s*"(.+)"$', content)
            self.assertIsNotNone(name, folder.name)
            self.assertIsNotNone(desc, folder.name)
            self.assertEqual(name.group(1), folder.name)
            self.assertLessEqual(len(desc.group(1)), 1024)
            self.assertGreaterEqual(len(desc.group(1)), 1)

    def test_no_duplicate_skill_ids(self):
        ids = [p.name for p in SKILLS.iterdir() if p.is_dir()]
        self.assertEqual(len(ids), len(set(ids)))

    def test_orchestrator_and_project_contract_exist(self):
        self.assertTrue((SKILLS / "veloria-orchestrator" / "SKILL.md").is_file())
        contract = (GOVERNANCE / "VELORIA_PROJECT_CONTRACT.md").read_text(encoding="utf-8")
        self.assertIn("Offline-First", contract)
        self.assertIn("Google Sheets", contract)
        self.assertIn("SQLite", contract)

    def test_sync_skill_does_not_promote_sheets_to_source_of_truth(self):
        body = (SKILLS / "veloria-sync" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("SQLite store remains authoritative", body)
        self.assertIn("Google Sheets is the approved intermediary", body)
        self.assertIn("authorized to see only their own records", body)

    def test_historical_timezone_offset_is_not_prescribed(self):
        body = (SKILLS / "veloria-closing" / "SKILL.md").read_text(encoding="utf-8")
        self.assertIn("do not hardcode a fixed offset", body)
        self.assertIn("Africa/Algiers", body)

    def test_governance_and_templates_are_installed(self):
        for name in [
            "VELORIA_PROJECT_CONTRACT.md",
            "SKILLS_REGISTRY.md",
            "SKILL_AUTHORING_STANDARD.md",
            "CHANGE_IMPACT_MATRIX.md",
            "PROJECT_FACTS_TO_VERIFY.md",
        ]:
            self.assertTrue((GOVERNANCE / name).is_file(), name)
        for name in ["ADR_TEMPLATE.md", "TASK_BRIEF_TEMPLATE.md", "RELEASE_NOTES_TEMPLATE.md"]:
            self.assertTrue((TEMPLATES / name).is_file(), name)

    def test_no_stale_file_survives_from_pre_migration_tree(self):
        payload_files = {
            str(p.relative_to(PAYLOAD)).replace("\\", "/") for p in PAYLOAD.rglob("*") if p.is_file()
        }
        installed_files = {
            str(p.relative_to(SKILLS)).replace("\\", "/") for p in SKILLS.rglob("*") if p.is_file()
        }
        self.assertEqual(installed_files - payload_files, set())

    def test_referenced_files_all_exist(self):
        for folder in sorted(p for p in SKILLS.iterdir() if p.is_dir()):
            body = (folder / "SKILL.md").read_text(encoding="utf-8")
            for ref in set(re.findall(r"(?:references/)([A-Za-z0-9_.-]+\.md)", body)):
                self.assertTrue((folder / "references" / ref).is_file(), f"{folder.name}/{ref}")

    def test_original_archive_is_preserved(self):
        archive = HERE / "vendor" / "archive" / "original-skills-v1.zip"
        self.assertTrue(archive.is_file())
        self.assertGreater(archive.stat().st_size, 1000)


if __name__ == "__main__":
    unittest.main()
