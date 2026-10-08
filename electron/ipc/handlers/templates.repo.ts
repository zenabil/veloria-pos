// Veloria PoS — Main-process repository: modèles d'impression (C6, migration 0036).
// Un modèle par (type, nom) ; un seul actif par type (UNIQUE partiel DB).
// Idempotence par operationId appelant (retry/double-clic rejoue, jamais de doublon).

import { getDb } from "../../database/sqlite.service";
import { claimIdempotency, peekIdempotency, storeIdempotencyResult } from "./idempotency";

export const TEMPLATE_DOC_TYPES = [
  "facture",
  "ticket",
  "proforma",
  "bon_livraison",
  "recu",
  "avoir",
  "etiquette",
] as const;

export type TemplateDocType = (typeof TEMPLATE_DOC_TYPES)[number];

export interface TemplateRow {
  id: number;
  doc_type: string;
  name: string;
  settings: Record<string, unknown>;
  version: number;
  is_factory: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function parseSettings(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toRow(r: Record<string, unknown>): TemplateRow {
  return {
    id: Number(r["id"]),
    doc_type: String(r["doc_type"]),
    name: String(r["name"]),
    settings: parseSettings(r["settings_json"]),
    version: Number(r["version"]),
    is_factory: Number(r["is_factory"]),
    is_active: Number(r["is_active"]),
    created_at: String(r["created_at"]),
    updated_at: String(r["updated_at"]),
  };
}

function assertDocType(docType: string): asserts docType is TemplateDocType {
  if (!(TEMPLATE_DOC_TYPES as readonly string[]).includes(docType)) {
    throw new Error("Type de document invalide.");
  }
}

export function listTemplates(): TemplateRow[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM print_templates ORDER BY doc_type ASC, is_active DESC, name ASC`)
    .all() as Record<string, unknown>[];
  return rows.map(toRow);
}

export function getTemplate(id: number): TemplateRow {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM print_templates WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error("Modèle introuvable.");
  return toRow(row);
}

export function getActiveTemplate(docType: string): TemplateRow | null {
  assertDocType(docType);
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM print_templates WHERE doc_type = ? AND is_active = 1`)
    .get(docType) as Record<string, unknown> | undefined;
  return row ? toRow(row) : null;
}

export function saveTemplateAtomic(args: {
  id: number | null;
  docType: string;
  name: string;
  settings: Record<string, unknown>;
  operationId: string;
  now: string;
}): { id: number; version: number } {
  assertDocType(args.docType);
  const name = args.name.trim();
  if (name.length < 2 || name.length > 100) throw new Error("Nom de modèle invalide.");
  const db = getDb();
  const fast = peekIdempotency<{ id: number; version: number }>(args.operationId, "templates.save");
  if (fast) return fast;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "templates.save", args.now);
    const payload = JSON.stringify(args.settings);
    if (args.id != null) {
      const row = db.prepare(`SELECT id FROM print_templates WHERE id = ?`).get(args.id) as
        | { id: number }
        | undefined;
      if (!row) throw new Error("Modèle introuvable.");
      try {
        db.prepare(
          `UPDATE print_templates SET doc_type = ?, name = ?, settings_json = ?, version = version + 1, updated_at = ? WHERE id = ?`,
        ).run(args.docType, name, payload, args.now, args.id);
      } catch (err) {
        if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
          throw new Error("Ce nom existe déjà pour ce type de document.");
        }
        throw err;
      }
      const version = (
        db.prepare(`SELECT version FROM print_templates WHERE id = ?`).get(args.id) as {
          version: number;
        }
      ).version;
      const out = { id: args.id, version: Number(version) };
      storeIdempotencyResult(args.operationId, out);
      return out;
    }
    try {
      const r = db
        .prepare(
          `INSERT INTO print_templates (doc_type, name, settings_json, version, is_factory, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0, ?, ?)`,
        )
        .run(args.docType, name, payload, args.now, args.now);
      const out = { id: Number(r.lastInsertRowid), version: 1 };
      storeIdempotencyResult(args.operationId, out);
      return out;
    } catch (err) {
      if (err instanceof Error && /UNIQUE constraint failed/i.test(err.message)) {
        throw new Error("Ce nom existe déjà pour ce type de document.");
      }
      throw err;
    }
  });
  try {
    return (tx as unknown as () => { id: number; version: number })();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekIdempotency<{ id: number; version: number }>(
        args.operationId,
        "templates.save",
      );
      if (retry) return retry;
    }
    throw err;
  }
}

export function activateTemplateAtomic(args: {
  id: number;
  operationId: string;
  now: string;
}): void {
  const db = getDb();
  const fast = peekIdempotency<{ activated: boolean }>(args.operationId, "templates.activate");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "templates.activate", args.now);
    const row = db.prepare(`SELECT doc_type FROM print_templates WHERE id = ?`).get(args.id) as
      | { doc_type: string }
      | undefined;
    if (!row) throw new Error("Modèle introuvable.");
    db.prepare(`UPDATE print_templates SET is_active = 0 WHERE doc_type = ?`).run(row.doc_type);
    db.prepare(`UPDATE print_templates SET is_active = 1, updated_at = ? WHERE id = ?`).run(
      args.now,
      args.id,
    );
    storeIdempotencyResult(args.operationId, { activated: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      return;
    }
    throw err;
  }
}

export function deleteTemplateAtomic(args: { id: number; operationId: string; now: string }): void {
  const db = getDb();
  const fast = peekIdempotency<{ deleted: boolean }>(args.operationId, "templates.delete");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "templates.delete", args.now);
    const row = db
      .prepare(`SELECT is_factory, is_active FROM print_templates WHERE id = ?`)
      .get(args.id) as { is_factory: number; is_active: number } | undefined;
    if (!row) throw new Error("Modèle introuvable.");
    if (row.is_factory === 1) throw new Error("Le modèle d'usine ne peut pas être supprimé.");
    if (row.is_active === 1) {
      throw new Error("Modèle actif : activez-en un autre avant de le supprimer.");
    }
    db.prepare(`DELETE FROM print_templates WHERE id = ?`).run(args.id);
    storeIdempotencyResult(args.operationId, { deleted: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      return;
    }
    throw err;
  }
}

const FACTORY_TYPES: TemplateDocType[] = [...TEMPLATE_DOC_TYPES];

export function resetFactoryAtomic(args: {
  docType: string | null;
  operationId: string;
  now: string;
}): void {
  if (args.docType != null) assertDocType(args.docType);
  const db = getDb();
  const fast = peekIdempotency<{ reset: boolean }>(args.operationId, "templates.reset");
  if (fast) return;
  const tx = db.transaction(() => {
    claimIdempotency(args.operationId, "templates.reset", args.now);
    const targets = args.docType ? [args.docType] : FACTORY_TYPES;
    for (const t of targets) {
      db.prepare(`DELETE FROM print_templates WHERE doc_type = ? AND is_factory = 0`).run(t);
      db.prepare(
        `UPDATE print_templates SET settings_json = '{}', version = 1, is_active = 1, updated_at = ? WHERE doc_type = ? AND name = 'Défaut' AND is_factory = 1`,
      ).run(args.now, t);
      db.prepare(
        `INSERT OR IGNORE INTO print_templates (doc_type, name, settings_json, version, is_factory, is_active, created_at, updated_at) VALUES (?, 'Défaut', '{}', 1, 1, 1, ?, ?)`,
      ).run(t, args.now, args.now);
    }
    storeIdempotencyResult(args.operationId, { reset: true });
  });
  try {
    (tx as unknown as () => void)();
  } catch (err) {
    if (
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      return;
    }
    throw err;
  }
}
