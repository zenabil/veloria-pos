// Veloria PoS — Main-process repository: profil entreprise (singleton id=1).

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { getDb } from "../../database/sqlite.service";
import { assertLogoValid } from "../../services/logo";
import { auditOperationId, claimOptional, peekOptional, storeOptional } from "./idempotency";

export interface CompanyInput {
  company_name: string | null;
  commercial_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  tax_number: string | null;
  commercial_register: string | null;
  /** C5 : NIS + article d'imposition (facture DZ réglementaire). */
  nis: string | null;
  article_imposition: string | null;
  invoice_prefix: string | null;
  logo_path: string | null;
}

export function getCompany(): Record<string, unknown> | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM company_profile WHERE id = 1`).get() as
    Record<string, unknown> | undefined;
  return row ?? null;
}

export function saveCompany(input: CompanyInput, now: string, operationId?: string | null): void {
  const db = getDb();
  const fast = peekOptional<{ saved: boolean }>(operationId, "company.update");
  if (fast) return;
  // Durcissement : le logo doit vivre dans le dossier possédé par l'app
  // (<userData>/logos, via le sélecteur qui y copie le fichier). Un chemin
  // manuel hors de ce dossier est refusé (primitive de lecture arbitraire
  // PNG/JPEG sinon) — l'impression continue sans logo (meilleur effort).
  const logoRaw = input.logo_path?.trim() || null;
  let logoPath: string | null = null;
  if (logoRaw) {
    const logosDir = path.normalize(path.join(app.getPath("userData"), "logos"));
    const candidate = path.normalize(logoRaw);
    const inside = candidate === logosDir || candidate.startsWith(logosDir + path.sep);
    if (!inside) {
      throw new Error("Logo invalide : utilisez le sélecteur de logo des paramètres.");
    }
    try {
      const stat = fs.statSync(candidate);
      assertLogoValid(candidate, stat.size);
    } catch (err) {
      if (err instanceof Error && err.message.startsWith("Logo ")) throw err;
      throw new Error("Logo invalide : fichier introuvable ou illisible.", { cause: err });
    }
    logoPath = candidate;
  }
  const tx = db.transaction(() => {
    claimOptional(operationId, "company.update", now);
    const exists = db.prepare(`SELECT id FROM company_profile WHERE id = 1`).get() as
      { id: number } | undefined;
    if (!exists) {
      db.prepare(
        `INSERT INTO company_profile (id, uuid, company_name, commercial_name, phone, email, website, address, city, nif, rc_number, nis, article_imposition, invoice_prefix, logo_path, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        randomUUID(),
        input.company_name?.trim() || "Veloria",
        input.commercial_name?.trim() || null,
        input.phone?.trim() || null,
        input.email?.trim() || null,
        input.website?.trim() || null,
        input.address?.trim() || null,
        input.city?.trim() || null,
        input.tax_number?.trim() || null,
        input.commercial_register?.trim() || null,
        input.nis?.trim() || null,
        input.article_imposition?.trim() || null,
        input.invoice_prefix?.trim() || "FAC",
        logoPath,
        now,
        now,
      );
    } else {
      db.prepare(
        `UPDATE company_profile SET company_name = COALESCE(?, company_name), commercial_name = ?, phone = ?, email = ?, website = ?, address = ?, city = ?, nif = ?, rc_number = ?, nis = ?, article_imposition = ?, invoice_prefix = ?, logo_path = ?, updated_at = ? WHERE id = 1`,
      ).run(
        input.company_name?.trim() || null,
        input.commercial_name?.trim() || null,
        input.phone?.trim() || null,
        input.email?.trim() || null,
        input.website?.trim() || null,
        input.address?.trim() || null,
        input.city?.trim() || null,
        input.tax_number?.trim() || null,
        input.commercial_register?.trim() || null,
        input.nis?.trim() || null,
        input.article_imposition?.trim() || null,
        input.invoice_prefix?.trim() || null,
        logoPath,
        now,
      );
    }
    // P8: fiche entreprise tracée (identité légale des factures) — audit déterministe.
    db.prepare(
      `INSERT INTO audit_log (event_id, event_type, entity_type, entity_id, operation_id, details_json, created_at) VALUES (?, 'company.saved', 'company', '1', ?, ?, ?)`,
    ).run(
      randomUUID(),
      auditOperationId(operationId, "company.saved", 1, {
        company_name: input.company_name,
        commercial_name: input.commercial_name,
      }),
      JSON.stringify({}),
      now,
    );
    storeOptional(operationId, { saved: true });
  });
  try {
    tx();
  } catch (err) {
    if (
      operationId &&
      err instanceof Error &&
      /UNIQUE constraint failed: idempotency_keys\.operation_id/i.test(err.message)
    ) {
      const retry = peekOptional<{ saved: boolean }>(operationId, "company.update");
      if (retry) return;
    }
    throw err;
  }
}
