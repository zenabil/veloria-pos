import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ROOT / ".opencode" / "skills"


class PackageTests(unittest.TestCase):
    def test_exactly_seventeen_skills(self):
        folders = [p for p in SKILLS.iterdir() if p.is_dir()]
        self.assertEqual(len(folders), 17)

    def test_every_skill_has_matching_frontmatter(self):
        for folder in SKILLS.iterdir():
            content = (folder / "SKILL.md").read_text(encoding="utf-8")
            self.assertTrue(content.startswith("---\n"), folder.name)
            name = re.search(r"(?m)^name:\s*([^\s]+)$", content)
            desc = re.search(r'(?m)^description:\s*"(.+)"$', content)
            self.assertIsNotNone(name, folder.name)
            self.assertIsNotNone(desc, folder.name)
            self.assertEqual(name.group(1), folder.name)
            self.assertLessEqual(len(desc.group(1)), 1024)

    def test_orchestrator_and_project_contract_exist(self):
        self.assertTrue((SKILLS / "veloria-orchestrator" / "SKILL.md").is_file())
        contract = (ROOT / "governance" / "VELORIA_PROJECT_CONTRACT.md").read_text(encoding="utf-8")
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

    def test_original_archive_is_preserved(self):
        self.assertGreater((ROOT / "archive" / "original-skills-v1.zip").stat().st_size, 1000)


if __name__ == "__main__":
    unittest.main()
