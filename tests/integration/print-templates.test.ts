// Veloria PoS — Intégration C6 : table print_templates (seed, contraintes).
// Le repo (getDb Electron) est couvert par bridge-shape + smoke ; ici : le
// schéma rejoué sur SQLite réel se comporte comme le contrat du repo.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tmp: string;
let db: DatabaseSync;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-tpl-"));
  db = new DatabaseSync(path.join(tmp, "t.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
});

afterAll(() => {
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("C6 print_templates (SQLite réel)", () => {
  it("seed : 7 modèles d'usine, un actif par type", () => {
    const rows = db
      .prepare("SELECT doc_type, name, is_factory, is_active FROM print_templates")
      .all() as { doc_type: string; name: string; is_factory: number; is_active: number }[];
    expect(rows).toHaveLength(7);
    const types = new Set(rows.map((r) => r.doc_type));
    expect(types).toEqual(
      new Set(["facture", "ticket", "proforma", "bon_livraison", "recu", "avoir", "etiquette"]),
    );
    for (const r of rows) {
      expect(r.name).toBe("Défaut");
      expect(r.is_factory).toBe(1);
      expect(r.is_active).toBe(1);
    }
  });

  it("UNIQUE (type, nom) + un seul actif par type", () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO print_templates (doc_type, name, created_at, updated_at) VALUES ('ticket', 'Défaut', '2026-10-03', '2026-10-03')",
        )
        .run(),
    ).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO print_templates (doc_type, name, is_active, created_at, updated_at) VALUES ('ticket', 'Nuit', 1, '2026-10-03', '2026-10-03')",
        )
        .run(),
    ).toThrow();
    db.prepare(
      "INSERT INTO print_templates (doc_type, name, settings_json, created_at, updated_at) VALUES ('ticket', 'Nuit', '{\"copies\": 2}', '2026-10-03', '2026-10-03')",
    ).run();
    const row = db
      .prepare(
        "SELECT settings_json FROM print_templates WHERE doc_type = 'ticket' AND name = 'Nuit'",
      )
      .get() as { settings_json: string };
    expect((JSON.parse(row.settings_json) as { copies: number }).copies).toBe(2);
  });

  it("type invalide refusé par le CHECK", () => {
    expect(() =>
      db
        .prepare(
          "INSERT INTO print_templates (doc_type, name, created_at, updated_at) VALUES ('facturette', 'X', '2026-10-03', '2026-10-03')",
        )
        .run(),
    ).toThrow();
  });
});
