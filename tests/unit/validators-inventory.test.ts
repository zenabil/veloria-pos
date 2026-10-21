// Veloria — Validators inventory lock (File Splitter guard).
// The barrel validators.ts must re-export every schema: count of
// `export const XSchema` across validators.*.ts equals the frozen total.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MODULES = [
  "validators.common.ts",
  "validators.catalog.ts",
  "validators.customers.ts",
  "validators.sales.ts",
  "validators.documents.ts",
  "validators.finance.ts",
  "validators.stock.ts",
  "validators.settings.ts",
  "validators.print.ts",
  "validators.templates.ts",
  // G-03 (P1, audit 2026-10-19) : `validators.staff.ts` était EXCLU de
  // l'inventaire ⇒ ajouter/supprimer un schéma de l'équipe ne faisait pas
  // échouer le test (113 gelés pour 121 réels). Le comptage est désormais
  // exhaustif : tout schéma Zod du main est dans le périmètre.
  "validators.staff.ts",
];

// ADR-075 (2026-10-09) : 125 → 122 (cartsClearSchema, customersImportSchema,
// periodSchema retirés avec leurs canaux morts ; closingsListSchema inliné).
// ADR-109 (2026-10-16) : 122 → 115 (7 schémas bread.* supprimés avec le module).
// ADR-112 (2026-10-17) : 115 → 116 (customerSortSchema : tri serveur customers.search).
// ADR-117 (2026-10-18) : 116 → 114 (printFormatSchema + alias
// paymentTicketFormatSchema retirés avec les canaux A4 de vente).
// ADR-119 (2026-10-19) : 114 → 113 (syncPendingSchema retiré avec le
// canal `sync.pending`, supersédé par le SELECT inline de pushNowAtomic).
// ADR-121 (2026-10-20) : 113 → 114 (closingReopenSchema ajouté avec le
// canal `closings.reopen` — réouverture d'une journée close, E-21).
// ADR-123 (2026-10-20, W4/G-03) : 114 → 121 (`validators.staff.ts` entre
// dans l'inventaire : les 7 schémas de l'équipe étaient hors comptage).
// ADR-130 (2026-10-21) : 121 → 122 (customersImportSchema ajouté avec le
// canal `customers.import` — import CSV clients).
const FROZEN_SCHEMA_COUNT = 122;
const FROZEN_MAX_LINES = 300;

describe("Validators inventory (split guard)", () => {
  it("schema count unchanged (no schema added/lost by the split)", () => {
    const root = path.resolve(__dirname, "../../electron/ipc");
    let total = 0;
    for (const m of MODULES) {
      const text = fs.readFileSync(path.join(root, m), "utf8");
      total += [...text.matchAll(/^export const (\w+Schema)/gm)].length;
    }
    expect(total).toBe(FROZEN_SCHEMA_COUNT);
  });

  it("every module stays under the size cap", () => {
    const root = path.resolve(__dirname, "../../electron/ipc");
    for (const m of MODULES) {
      const lines = fs.readFileSync(path.join(root, m), "utf8").split("\n").length;
      expect(lines, `${m} dépasse ${FROZEN_MAX_LINES}`).toBeLessThanOrEqual(FROZEN_MAX_LINES);
    }
  });
});
