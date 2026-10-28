// Veloria PoS — Feature Clients : types partagés + helpers purs.
// Les montants restent en centimes (DZD) jusqu'au formatage.

export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  phone: string | null;
  address: string | null;
  credit_limit_minor: number;
  outstanding_balance_minor: number;
  debt_status: string;
  is_over_limit: number;
  /** Vente à crédit autorisée (opt-in, migration 0007). */
  credit_allowed: number;
  /** Jour de règlement mensuel (1-31, ex. 14) ; null = sans échéance fixe. */
  settlement_day: number | null;
  notes: string | null;
  created_at: string;
  deleted_at: string | null;
}

/** Ligne enrichie (relevé) pour la table et le tiroir. */
export interface EnrichedCustomer extends Customer {
  invoiceCount: number;
  totalPurchasesMinor: number;
  lastSaleAt: string | null;
}

export interface StatementSale {
  id: number;
  invoice_number: string;
  total_minor: number;
  amount_paid_minor: number;
  remaining_balance_minor: number;
  payment_status: string;
  is_cancelled: number;
  created_at: string;
}

export type ArchiveFilter = "active" | "archived" | "all";
export type CreditFilter = "all" | "with_debt" | "no_debt" | "over_limit";
export type CustomerSort = "name_asc" | "name_desc" | "debt_desc" | "debt_asc" | "purchases_desc";

export function fullName(c: Pick<Customer, "first_name" | "last_name">): string {
  return `${c.first_name} ${c.last_name}`.trim();
}

/**
 * Lignes CSV RÉIMPORTABLES — format exact de `parseCustomersCsv`
 * (`prénom;nom;téléphone`, ADR-135). On garde prénom et nom séparés (jamais
 * le nom complet du rapport) : l'import ne saurait pas les redécouper sans
 * perdre les noms composés.
 */
export function customerImportCsvRows(
  rows: Pick<Customer, "first_name" | "last_name" | "phone">[],
): Record<string, unknown>[] {
  return rows.map((c) => ({
    prénom: c.first_name,
    nom: c.last_name,
    téléphone: c.phone ?? "",
  }));
}

export function isArchived(c: Customer): boolean {
  return c.deleted_at != null;
}

export function hasDebt(c: Customer): boolean {
  return c.outstanding_balance_minor > 0;
}

export function isOverLimit(c: Customer): boolean {
  return c.is_over_limit === 1;
}

export function debtLabel(c: Customer): string {
  if (isArchived(c)) return "Archivé";
  if (isOverLimit(c)) return "Dépassement";
  if (c.debt_status === "overdue") return "En retard";
  if (hasDebt(c)) return "Endetté";
  return "À jour";
}

export function debtTone(c: Customer): "green" | "amber" | "red" | "grey" {
  if (isArchived(c)) return "grey";
  if (isOverLimit(c) || c.debt_status === "overdue") return "red";
  if (hasDebt(c)) return "amber";
  return "green";
}

/** « Prénom Nom » saisi en un champ → prénom + nom (dernier mot = nom). */
export function splitFullName(raw: string): { firstName: string; lastName: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: parts[0] ?? "" };
  const last = parts[parts.length - 1] ?? "";
  return { firstName: parts.slice(0, -1).join(" "), lastName: last };
}

/**
 * Nom à enregistrer : un nom existant non modifié garde ses deux champs
 * d'origine (un nom de famille composé ne doit pas être redécoupé quand on
 * change seulement le téléphone). Une saisie explicite repasse par le split.
 */
export function resolveCustomerName(
  customer: Pick<Customer, "first_name" | "last_name"> | null,
  full: string,
  nameEdited: boolean,
): { firstName: string; lastName: string } {
  if (customer != null && !nameEdited) {
    return { firstName: customer.first_name, lastName: customer.last_name };
  }
  return splitFullName(full);
}

/** Relevé client (canal `customers.statement`) : fiche + ventes + paiements. */
export interface CustomerStatement {
  customer: Customer;
  sales: StatementSale[];
  payments: unknown[];
}

/** Enrichit une fiche avec son relevé (factures non annulées). Pur, testable. */
export function enrichCustomer(c: Customer, st: CustomerStatement | null): EnrichedCustomer {
  const sales = (st?.sales ?? []).filter((s) => s.is_cancelled !== 1);
  return {
    ...c,
    invoiceCount: sales.length,
    totalPurchasesMinor: sales.reduce((a, s) => a + s.total_minor, 0),
    lastSaleAt:
      sales.length > 0
        ? (sales
            .map((s) => s.created_at)
            .sort()
            .reverse()[0] ?? null)
        : null,
  };
}
