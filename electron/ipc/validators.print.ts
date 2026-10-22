// Veloria PoS - Zod: impression + sauvegardes + licences + etiquettes + documents (extrait de validators.ts, deplacement pur).

import { z } from "zod";
import { moneyMinor } from "./validators.common";
import { quantity } from "./validators.common";
import { optionalOperationId } from "./validators.common";
import { timbreQuittanceLf2025 } from "../printing/receipt-documents";

export const printLineSchema = z.object({
  name: z.string().min(1).max(200),
  qty: quantity,
  unit: z.string().max(20).default(""),
  unitPriceMinor: moneyMinor,
  lineTotalMinor: moneyMinor,
  ref: z.string().max(20).default(""),
});

export const printerSaveSchema = z.object({
  name: z.string().max(200).nullable(),
  operationId: optionalOperationId,
});

export const backupAutoSchema = z.object({
  enabled: z.boolean().default(true),
  intervalDays: z.number().int().min(1).max(30).default(1),
  frequency: z
    .enum(["10min", "30min", "1h", "6h", "12h", "daily", "weekly", "custom"])
    .default("daily"),
  customMinutes: z.number().int().min(5).max(10080).default(60),
  retentionCount: z.number().int().min(1).max(100).default(30),
  operationId: optionalOperationId,
});

export const backupExportSchema = z.object({
  folder: z.string().min(1).max(500),
});

// Restauration : fichier candidat explicite (suffixe + existence + santé
// vérifiés côté service avant tout swap, avec snapshot + rollback).
// A-11 (P1) : `operationId` EXIGÉ — une restauration est l'opération la plus
// destructive du produit ; sans clé de rejouabilité, un retry après incident
// rejoue tout le séquence snapshot→vérif→copie→réouverture.
export const backupRestoreSchema = z.object({
  file: z.string().min(1).max(2000),
  operationId: z.string().uuid(),
});

// Récupération au démarrage (base non prête) : actions sans charge utile,
// validées explicitement comme tous les autres canaux (pas de run-sql).
export const recoveryActionSchema = z.object({});

// Licence hors-ligne : import via dialogue fichier côté main (aucune charge
// utile depuis le renderer — jamais de contenu .vlic via IPC).
export const licenseActionSchema = z.object({});

// Chrome frameless : actions fenêtre sans charge utile (pas de remote).
export const windowActionSchema = z.object({});

export const printPayloadSchema = z
  .object({
    company: z.string().max(200).default("Veloria"),
    customerName: z.string().max(200).default(""),
    customerPhone: z.string().max(30).default(""),
    customerAddress: z.string().max(300).default(""),
    customerCode: z.string().max(20).default(""),
    seller: z.string().max(100).default(""),
    tvaRatePercent: z.number().min(0).max(100).default(0),
    htMinor: moneyMinor.default(0),
    tvaMinor: moneyMinor.default(0),
    qrPayload: z.string().max(300).default(""),
    qrSvg: z.string().max(200_000).default(""),
    companyPhone: z.string().max(30).default(""),
    companyAddress: z.string().max(300).default(""),
    companyCity: z.string().max(100).default(""),
    companyEmail: z.string().max(100).default(""),
    companyRc: z.string().max(50).default(""),
    companyNif: z.string().max(50).default(""),
    companyNis: z.string().max(50).default(""),
    companyArticle: z.string().max(50).default(""),
    companyLogo: z.string().max(600_000).default(""),
    paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
    dueDate: z.string().max(50).default(""),
    notes: z.string().max(1000).default(""),
    invoice: z.string().max(50).default(""),
    date: z.string().max(50).default(""),
    lines: z.array(printLineSchema).min(1).max(200),
    subtotalMinor: moneyMinor.default(0),
    discountMinor: moneyMinor.default(0),
    deliveryMinor: moneyMinor.default(0),
    totalMinor: moneyMinor.default(0),
    paidMinor: moneyMinor.default(0),
    /** C5 : timbre LF 2025 documentaire (espèces, 0 sinon) — net = total + timbre. */
    stampMinor: moneyMinor.default(0),
    prevBalanceMinor: moneyMinor.nullable().optional(),
    currentBalanceMinor: moneyMinor.nullable().optional(),
  })
  // P04: cohérence arithmétique du ticket — un payload incohérent (total ≠
  // subtotal-remise+livraison, sous-total ≤ Σ lignes, ligne ≤ prix×qté) est
  // rejeté au lieu d'imprimer des montants faux (renderer compromis).
  .superRefine((v, ctx) => {
    for (let i = 0; i < v.lines.length; i++) {
      const l = v.lines[i];
      if (!l) continue;
      const expected = Math.round(l.unitPriceMinor * l.qty);
      // Mode « Montant » (ADR-114) : le montant facturé est celui SAISI, il
      // peut donc s'écarter de prix × qté — mais SEULEMENT dans la borne
      // d'arrondi de la quantité (0,0005 × prix + 1 centime). Au-delà : payload
      // incohérent ⇒ refusé (jamais de montant faux imprimé).
      const tolerance = Math.ceil(l.unitPriceMinor * 0.0005) + 1;
      if (Math.abs(l.lineTotalMinor - expected) > tolerance) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Ligne ${i + 1} incohérente.`,
          path: ["lines", i, "lineTotalMinor"],
        });
        break;
      }
    }
    const sum = v.lines.reduce((a, l) => a + l.lineTotalMinor, 0);
    // P04-fix: deux sémantiques de remise coexistent dans le domaine —
    // (a) VENTES : sous-total = Σ prix d'ORIGINE, remise portée par les lignes
    //     (prix facturés) → c'est (sous-total − remise) qui égale Σ lignes ;
    // (b) DEVIS : sous-total = Σ lignes (prix pleins), remise GLOBALE en sus
    //     → c'est le sous-total seul qui égale Σ lignes.
    // L'ancienne forme (a seule) rejetait les devis remisés, et avant elle la
    // forme (b seule) rejetait les ventes remisées (« Document d'impression
    // invalide. » sur l'aperçu). Les deux formes cohérentes sont acceptées ;
    // tout le reste (somme fausse, remise > sous-total, total faux) est rejeté.
    const chargedSum = v.subtotalMinor - v.discountMinor;
    if (sum !== v.subtotalMinor && sum !== chargedSum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sous-total/remise incohérents avec les lignes.",
        path: ["subtotalMinor"],
      });
    }
    if (v.discountMinor > v.subtotalMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Remise supérieure au sous-total.",
        path: ["discountMinor"],
      });
    }
    const expectedTotal = v.subtotalMinor - v.discountMinor + v.deliveryMinor;
    if (v.totalMinor !== expectedTotal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Total incohérent.",
        path: ["totalMinor"],
      });
    }
    // P0-1 : ventilation TVA optionnelle — quand taux > 0 et montants fournis,
    // ht + tva doit égaler le TTC (centimes, sans float).
    const rate = typeof v.tvaRatePercent === "number" ? v.tvaRatePercent : 0;
    if (rate > 0 && (v.htMinor > 0 || v.tvaMinor > 0) && v.htMinor + v.tvaMinor !== v.totalMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ventilation HT/TVA incohérente avec le total.",
        path: ["htMinor"],
      });
    }
    // P05: paidMinor affiché peut dépasser le total (espèces rendues) — la
    // règle paid ≥ total reste côté vente (sale-rules), le ticket affiche
    // Monnaie rendue via buildReceiptText:311 sans la stocker.
    // C5 : timbre documentaire LF 2025 — calculé sur l'encaissé espèces
    // (quittance), 0 sinon ; forger un timbre faux rejette le document.
    const stampExpected = timbreQuittanceLf2025(v.paidMinor, v.paymentMethod ?? null);
    if (v.stampMinor !== stampExpected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Timbre fiscal incohérent.",
        path: ["stampMinor"],
      });
    }
  });

// Export PDF (ticket) : `filePath` optionnel validé séparément
// (printPayloadSchema porte déjà un superRefine : ZodEffects non extensible).
// Sans `filePath` : dialogue natif d'enregistrement côté main — jamais
// d'écriture silencieuse arbitraire. Avec : absolu, extension .pdf, dossier
// parent validé via assertSafeUserFolder (pas de traversal, pas de système).
export const pdfFilePathSchema = z.object({
  filePath: z.string().max(2000).nullable().optional(),
});

// Reçu de règlement de dette : aperçu + impression
// ticket 80/58 (jamais A4) après encaissement (client / fournisseur / pain).
// Cohérence arithmétique exigée : nouveau solde = ancien − montant.
export const paymentTicketSchema = z
  .object({
    company: z.string().max(200).default("Veloria"),
    companyPhone: z.string().max(30).default(""),
    companyAddress: z.string().max(300).default(""),
    companyCity: z.string().max(100).default(""),
    companyEmail: z.string().max(100).default(""),
    companyRc: z.string().max(50).default(""),
    companyNif: z.string().max(50).default(""),
    companyNis: z.string().max(50).default(""),
    companyArticle: z.string().max(50).default(""),
    companyLogo: z.string().max(600_000).default(""),
    partyLabel: z.string().min(1).max(200),
    kind: z.enum(["customer", "supplier"]),
    reference: z.string().max(50).default(""),
    date: z.string().max(50).default(""),
    amountMinor: z.number().int().min(1).max(1_000_000_000),
    paymentMethod: z.enum(["cash", "cheque", "transfer"]).nullable().optional(),
    prevBalanceMinor: moneyMinor,
    newBalanceMinor: moneyMinor,
    notes: z.string().max(500).default(""),
    footerText: z.string().max(500).default(""),
    thankYouMessage: z.string().max(500).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.newBalanceMinor !== v.prevBalanceMinor - v.amountMinor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Soldes incohérents (nouveau = ancien − montant).",
        path: ["newBalanceMinor"],
      });
    }
  });

export const labelItemSchema = z.object({
  name: z.string().min(1).max(200),
  priceMinor: moneyMinor,
  barcode: z.string().min(1).max(64),
  copies: z.number().int().min(1).max(100).default(1),
});

// Étiquettes code-barres : gabarits thermiques uniquement (jamais A4).
export const labelFormatSchema = z.enum(["30x20", "45x20", "50x30", "58x30", "58x40", "custom"]);

export const labelsPayloadSchema = z.object({
  items: z.array(labelItemSchema).min(1).max(50),
  format: labelFormatSchema.default("45x20"),
  customWidthMm: z.number().min(10).max(210).default(50),
  customHeightMm: z.number().min(10).max(297).default(30),
  /** C5 : QR du code-barres sous le Code 39 (opt-in, étiquettes riches). */
  qr: z.boolean().default(false),
});

// OCR local (aucune écriture : sélection + analyse + annulation + nettoyage).
// L'import passe ensuite par `stock.intake` après relecture humaine.

// P0-3 : documents logistiques (bon de livraison / bon de retour / bon de commande).
// Réutilisent la cohérence du ticket (printPayloadSchema) + références d'origine.
const printBase = printPayloadSchema.innerType();

export const deliveryPayloadSchema = printBase.extend({
  originNumber: z.string().max(50).default(""),
  deliverer: z.string().max(100).default(""),
});

export const returnSlipPayloadSchema = printBase.extend({
  returnNumber: z.string().max(50).default(""),
  /** C5 : vente d'origine (traçabilité avoir, optionnel). */
  originNumber: z.string().max(50).default(""),
  reason: z.string().max(300).default(""),
  refundMinor: moneyMinor.default(0),
});

export const purchaseOrderDocPayloadSchema = printBase.extend({
  orderNumber: z.string().max(50).default(""),
  supplierName: z.string().max(200).default(""),
  supplierPhone: z.string().max(30).default(""),
  supplierAddress: z.string().max(300).default(""),
  validityDays: z.number().int().min(1).max(365).default(30),
});
