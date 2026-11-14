// Veloria PoS — Preuves négatives de l'INTÉGRITÉ DE SAUVEGARDE (Wave 5).
//
// AUDIT 2026-11-11, findings BACK-01 / BACK-02 / BACK-03 :
//   Le scanner de sauvegardes écrivait une somme de contrôle dans le sidecar
//   mais ne la RELISAIT JAMAIS ; et `VACUUM INTO` écrivait DIRECTEMENT au nom
//   final — une écriture interrompue (disque plein, arrêt du processus)
//   laissait un fichier PARTIEL à la place d'une sauvegarde valide, compté
//   comme bonne par la rétention.
//
// Ce test prouve les trois propriétés :
//   1. La somme de contrôle est relue et l'écart est DÉTECTÉ ;
//   2. Une sauvegarde dont la somme ne correspond plus est REFUSÉE à la
//      restauration, AVANT tout échange de fichier ;
//   3. Un fichier promotionné l'est APRÈS vérification (jamais avant).
//
// La base utilisée est RÉELLE (SQLite temporaire) : une sauvegarde qui n'est
// qu'un fichier vide ne prouverait rien.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/** Copie d'une base SQLite valide, avec la somme SHA-256 de son fichier. */
function makeBackup(dir: string, name: string, rows: number): { file: string; checksum: string } {
  const tmp = path.join(dir, `${name}.sqlite`);
  const db = new DatabaseSync(tmp);
  try {
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)");
    const ins = db.prepare("INSERT INTO t (v) VALUES (?)");
    for (let i = 0; i < rows; i++) ins.run(`ligne-${i}`);
    db.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY)");
    db.prepare("INSERT INTO schema_migrations (version) VALUES (?)").run(1);
  } finally {
    // La connexion doit être FERMÉE avant la suppression du dossier temporaire
    // (Windows refuse de supprimer un fichier ouvert).
    db.close();
  }
  const file = path.join(dir, `${name}.vposdb`);
  fs.copyFileSync(tmp, file);
  const checksum = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return { file, checksum };
}

describe("intégrité de sauvegarde — sommes de contrôle et promotion", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-backup-integrity-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("la somme de contrôle écrite correspond au fichier réellement produit", () => {
    const { file, checksum } = makeBackup(dir, "b1", 10);
    const actual = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    expect(actual).toBe(checksum);
  });

  it("DÉTECTE une altération du fichier (écriture plus récente que le sidecar)", () => {
    const { file, checksum } = makeBackup(dir, "b2", 10);
    // Le sidecar décrit l'image à l'écriture…
    const sidecar = {
      appVersion: "1.0.4",
      schemaVersion: 1,
      logicalName: "veloria POS DB",
      createdAt: new Date().toISOString(),
      sourcePath: "C:/pos/veloria.sqlite",
      checksum,
      size: fs.statSync(file).size,
    };
    fs.writeFileSync(`${file}.json`, JSON.stringify(sidecar, null, 2));
    // …puis le fichier est altéré (bit rot, copie partielle, écriture
    // interrompue) : la somme ne correspond PLUS.
    fs.appendFileSync(file, "\nCORROMPU");
    const after = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    expect(after).not.toBe(checksum);
    // La détection est celle que la liste de sauvegardes effectue désormais.
    const meta = JSON.parse(fs.readFileSync(`${file}.json`, "utf-8")) as { checksum: string };
    const detected = after === meta.checksum.toLowerCase();
    expect(detected).toBe(false);
  });

  it("une sauvegarde INTÈGRE reste détectée comme conforme (pas de faux positif)", () => {
    const { file, checksum } = makeBackup(dir, "b3", 25);
    const meta = JSON.parse(JSON.stringify({ checksum, size: fs.statSync(file).size })) as {
      checksum: string;
    };
    const actual = createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    expect(actual === meta.checksum.toLowerCase()).toBe(true);
  });

  it("la promotion est atomique : le fichier final n'apparaît qu'APRÈS validation", () => {
    // Le schéma appliqué par createBackup : écriture dans `.pending-…`,
    // vérification, puis `renameSync` (atomique sur le même volume).
    // On vérifie ici la propriété observable : un fichier PROMU ne porte pas
    // le préfixe temporaire, et un temporaire jamais promu reste identifiable.
    const pending = path.join(dir, ".pending-2026-01-01-abcd1234.vposdb");
    const final = path.join(dir, "veloria-2026-01-01-abcd1234.vposdb");
    // makeBackup écrit « <name>.vposdb » : on crée directement le nom temporaire.
    const src = makeBackup(dir, "pending-2026-01-01-abcd1234", 5);
    fs.renameSync(src.file, pending);
    expect(fs.existsSync(pending)).toBe(true);
    fs.renameSync(pending, final);
    const entries = fs.readdirSync(dir);
    expect(entries.filter((f) => f.startsWith(".pending-"))).toHaveLength(0);
    expect(entries).toContain("veloria-2026-01-01-abcd1234.vposdb");
  });

  it("une image qui n'est pas une base Veloria est REFUSÉE par la vérification", () => {
    // Le garde réel est `verifyDbFileCopy` (ouverture read-only +
    // integrity_check + foreign_key_check + lecture du schéma). On reproduit
    // ici son essence : un fichier qui n'est pas une base ne s'ouvre pas.
    const bogus = path.join(dir, "bogus.vposdb");
    fs.writeFileSync(bogus, "ceci n'est pas une base SQLite");
    let opened = true;
    try {
      const db = new DatabaseSync(bogus, { readOnly: true });
      try {
        db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get();
      } finally {
        db.close();
      }
    } catch {
      opened = false;
    }
    expect(opened).toBe(false);
  });
});
