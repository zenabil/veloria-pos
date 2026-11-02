// Veloria PoS — ADR-171 : liasse de supervision propriétaire (CONSTRUCTEUR).
// Preuve d'intégration sur base migrée réelle (node:sqlite, TOUTES les
// migrations rejouées) : une journée complète est semée, puis la liasse est
// comparée à des chiffres CALCULÉS À LA MAIN. Le constructeur n'est pas mocké :
// si un agrégat dérive, le test rougit.
//
// E-35 / ADR-169 : une vente encaissée à 00:30 heure du magasin (23:30Z la
// veille) appartient bien à la journée `2026-09-02` — et c'est cette journée
// que rend `day.date`.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = repoDb.current as {
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown;
        get: (...params: unknown[]) => unknown;
        run: (...params: unknown[]) => { changes: number | bigint };
      };
      exec: (sql: string) => void;
    } | null;
    if (!db) throw new Error("Base de test non ouverte.");
    return {
      prepare: (sql: string) => db.prepare(sql),
      transaction:
        <R>(fn: () => R) =>
        (): R => {
          db.exec("BEGIN;");
          try {
            const out = fn();
            db.exec("COMMIT;");
            return out;
          } catch (err) {
            try {
              db.exec("ROLLBACK;");
            } catch {
              /* best effort */
            }
            throw err;
          }
        },
    };
  },
  // Verdict d'intégrité CONNU (jamais lu depuis l'hôte) : la liasse doit le
  // transporter tel quel dans `alerts.system`, avec son horodatage.
  integrityCheck: () => ({ integrity: "ok", foreignKeys: [] }),
  getLastIntegrityResult: () => ({ integrity: "ok", at: "2026-09-02T06:00:00.000Z" }),
}));

vi.mock("../../electron/backup/backup.service", () => ({
  backupStatus: () => ({ count: 0, lastAt: null, lastFile: null, auto: null }),
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

import {
  closeCashSessionAtomic,
  openCashSessionAtomic,
} from "../../electron/ipc/handlers/cash-session.repo";
import {
  MAX_LIASSE_CHARS,
  buildOwnerSnapshot,
  type OwnerSnapshot,
} from "../../electron/sync/owner-snapshot";

/**
 * `operationId` UUID issu d'un hachage SHA-256 COMPLET : un préfixe tronqué
 * ferait rejouer l'opération d'un autre semis (l'idempotence est littérale).
 */
const OP = (seed: string): string => {
  const hex = createHash("sha256").update(`veloria-liasse-${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const DAY = "2026-09-02";
/** 19:30 heure d'Alger → journée métier `DAY` (l'horloge de l'hôte est ignorée). */
const NOW = `${DAY}T18:30:00.000Z`;
/** 23:30Z de la veille = 00:30 du 2 à Alger → journée `DAY`, PAS `DAY − 1`. */
const EDGE_IN = "2026-09-01T23:30:00.000Z";
/** DAY − 29 : première journée de la fenêtre de 30 journées métier. */
const WINDOW_FROM = "2026-08-04";

// ---------------------------------------------------------------------------
// Valeurs ATTENDUES, calculées à la main sur le semis de `seed()`.
// ---------------------------------------------------------------------------
// Jour : S1 10 200 + S2 5 000 = 15 200, moins le retour R1 5 000 → 10 200.
// COGS : 8 100 + 4 000 − 4 000 (retour restocké) = 8 100 → marge 2 100.
// Cash : encaissés 1 500 − remboursé 5 000 − dépense 1 200 = −4 700.
// 30 j : + S5 215 000 + S4 2 000 → 227 200 ; COGS net 181 100 → marge 46 100.
const EXPECT = {
  daySalesMinor: 10200,
  dayProfitMinor: 2100,
  dayCashMinor: -4700,
  dayReturnsMinor: 5000,
  dayTickets: 2,
  dayBasketMinor: 5100,
  periodTotalMinor: 227200,
  periodTickets: 4,
  periodBasketMinor: 56800,
  periodMarginMinor: 46100,
  stockValueMinor: 58000, // 24 000 + 30 000 + 0 + 4 000
  debtTotalMinor: 10000, // S2 5 000 + S3 3 000 + S4 2 000
  debtOverdueMinor: 5000, // S3 + S4 : échéances passées
  agingD0to30: 7000, // S2 (échéance future) + S4 (8 j de retard)
  agingD60plus: 3000, // S3 (63 j de retard)
} as const;

/**
 * Garde de forme de l'application propriétaire, ré-implémentée À L'IDENTIQUE
 * depuis `owner/src/api.ts:179-192` (`isSnapshotShape`). Le workspace `owner/`
 * n'est PAS résolvable depuis un test racine (frontière rootDir, AGENTS.md
 * règle 5) : les 5 conditions sont donc recopiées ici, littéralement.
 */
function isSnapshotShape(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  const day = o["day"] as Record<string, unknown> | undefined;
  const stock = o["stock"] as Record<string, unknown> | undefined;
  const money = o["money"] as Record<string, unknown> | undefined;
  return (
    typeof o["shopName"] === "string" &&
    typeof o["generatedAt"] === "string" &&
    typeof day?.["salesMinor"] === "number" &&
    typeof stock?.["valueMinor"] === "number" &&
    typeof money?.["debts"] === "object"
  );
}

/**
 * `formatMinor` de l'app propriétaire LEVE sur un non-entier
 * (`owner/src/format.ts:70-77`) : chaque `*Minor` NUMÉRIQUE de la liasse est
 * vérifié entier sûr, récursivement, sans exception. Les `*Minor` `null` sont
 * conformes au contrat (valeur absente, jamais devinée) et ne passent donc pas
 * par `formatMinor`.
 */
function assertMinorAreIntegers(value: unknown, trail = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertMinorAreIntegers(item, `${trail}[${i}]`));
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (key.endsWith("Minor")) {
        if (item === null) continue;
        expect(Number.isSafeInteger(item), `${trail}.${key} = ${JSON.stringify(item)}`).toBe(true);
      }
      assertMinorAreIntegers(item, `${trail}.${key}`);
    }
  }
}

/** Accès étroit sans assertion non-null (`!` interdit par eslint). */
function need<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) throw new Error(`${label} absent de la liasse.`);
  return value;
}

/** Identifiant SQLite du client semé (réservé par `seed`, jamais deviné). */
let seededCustomerId = 0;

describe("Liasse de supervision propriétaire (ADR-171)", () => {
  let tmp: string;
  let db: DatabaseSync;

  // Le constructeur de liasse LIT sans ÉCRIRE : une seule base migrée et semée
  // sert tous les essais (le semage des migrations coûte ~2 s, il n'est donc
  // pas rejoué treize fois — sans partager d'état entre les essais).
  beforeAll(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-liasse-"));
    db = new DatabaseSync(path.join(tmp, "liasse.sqlite"));
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys=ON;");
    repoDb.current = db;
    seed(db);
  }, 120_000);

  afterAll(() => {
    repoDb.current = null;
    seededCustomerId = 0;
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("passe la garde de forme de l'app propriétaire et borne sa taille", () => {
    const s = buildOwnerSnapshot(NOW);
    expect(isSnapshotShape(s)).toBe(true);
    expect(s.version).toBe(1);
    expect(s.shopName).toBe("Superette Veloria");
    expect(s.generatedAt).toBe(NOW);
    expect(JSON.stringify(s).length).toBeLessThan(MAX_LIASSE_CHARS);
    assertMinorAreIntegers(s);
  });

  it("cale la journée sur le jour métier Africa/Algiers (vente de 00:30)", () => {
    const s = buildOwnerSnapshot(NOW);
    expect(s.day.date).toBe(DAY);
    // S1 est encaissée à 23:30Z DU 1er = 00:30 du 2 : elle compte dans le jour.
    expect(s.day.salesMinor).toBe(EXPECT.daySalesMinor);
    expect(s.day.salesCount).toBe(EXPECT.dayTickets);
    expect(s.day.basketMinor).toBe(EXPECT.dayBasketMinor);
    expect(s.day.returnsMinor).toBe(EXPECT.dayReturnsMinor);
    expect(s.day.returnsCount).toBe(1);
    expect(s.day.profitMinor).toBe(EXPECT.dayProfitMinor);
    expect(s.day.cashMinor).toBe(EXPECT.dayCashMinor);
    // La veille ne porte AUCUNE vente : le 00:30 est bien rattrapé sur le jour J.
    expect(s.day.ticketsDelta).toBe(EXPECT.dayTickets);
    // Aucun objectif n'est saisi dans le POS → null, jamais un objectif inventé.
    expect(s.day.objectiveMinor).toBeNull();
    expect(s.day.comparison.previousLabel).toBe("hier");
    expect(s.day.comparison.deltaPercent).toBe(0);
  });

  it("borne la journée au seuil du jour métier (23:30 inclus, 00:30 exclu)", () => {
    // 23:30 algérien du 2 → toujours journée `DAY`.
    expect(buildOwnerSnapshot(`${DAY}T22:30:00.000Z`).day.date).toBe(DAY);
    // 00:30 algérien du 3 → journée suivante, et plus aucune vente du jour.
    const next = buildOwnerSnapshot("2026-09-02T23:30:00.000Z");
    expect(next.day.date).toBe("2026-09-03");
    expect(next.day.salesMinor).toBe(0);
    expect(next.day.salesCount).toBe(0);
  });

  it("rend des parts de paiement dont la somme vaut 100 %", () => {
    const methods = buildOwnerSnapshot(NOW).day.methods;
    expect(methods.map((m) => m.method).sort()).toEqual(["card", "cash"]);
    const cash = need(
      methods.find((m) => m.method === "cash"),
      "bucket espèces",
    );
    const card = need(
      methods.find((m) => m.method === "card"),
      "bucket carte",
    );
    expect(cash.label).toBe("Espèces");
    expect(card.label).toBe("Chèque / virement");
    // Espèces : encaissé 500 − remboursé 5 000. Chèque (bucket carte) : 1 000.
    expect(cash.totalMinor).toBe(-4500);
    expect(cash.count).toBe(2);
    expect(card.totalMinor).toBe(1000);
    expect(card.count).toBe(1);
    expect(cash.sharePercent).toBe(81.8);
    expect(card.sharePercent).toBe(18.2);
    expect(cash.sharePercent + card.sharePercent).toBe(100);
  });

  it("détaille le journal 24 h : chaque ligne porte son propre type de pièce", () => {
    const journal = buildOwnerSnapshot(NOW).day.journal;
    expect(journal.length).toBe(6);
    for (const row of journal) {
      expect(row.id.startsWith(`${row.kind}-`)).toBe(true);
      expect(row.tx.kind).toBe(row.kind);
      expect(Number.isSafeInteger(row.amountMinor)).toBe(true);
      expect(row.at >= "2026-09-01T18:30:00.000Z" && row.at <= NOW).toBe(true);
    }
    // Ordre strictement décroissant des instants (fenêtre glissante de 24 h).
    expect(journal.map((r) => r.kind)).toEqual([
      "payment",
      "payment",
      "sale",
      "return",
      "expense",
      "sale",
    ]);
    const creditSale = need(journal.find((r) => r.ref === "FAC-0002")?.tx, "vente FAC-0002");
    if (creditSale.kind !== "sale") throw new Error("Type de pièce attendu : vente.");
    // Session résolue depuis les instants : ouverte à 07:30Z, la vente à 08:00Z.
    expect(creditSale.session).toBe("Caisse 2 — matin");
    expect(creditSale.cashier).toBe("Nadia Zerrouki");
    expect(creditSale.subtotalMinor).toBe(5000);
    expect(creditSale.totalMinor).toBe(5000);
    expect(creditSale.discountMinor).toBe(0);
    expect(creditSale.payment.receivedMinor).toBe(0);
    // La monnaie rendue n'est JAMAIS stockée → 0, jamais deviné.
    expect(creditSale.payment.changeMinor).toBe(0);
    expect(creditSale.lines).toEqual([
      { name: "Farine 1 kg", qty: 1, unitMinor: 5000, totalMinor: 5000 },
    ]);

    const retour = need(journal.find((r) => r.kind === "return")?.tx, "retour");
    if (retour.kind !== "return") throw new Error("Type de pièce attendu : retour.");
    expect(retour.originInvoice).toBe("FAC-0001");
    expect(retour.reason).toBe("Sac percé");
    expect(retour.refund.amountMinor).toBe(5000);
    expect(retour.refund.toDebtMinor).toBe(0);
    expect(retour.refund.label).toBe("Espèces");
    expect(retour.operator).toBe("Karim Haddad");
    expect(retour.totalMinor).toBe(5000);
    expect(retour.lines).toEqual([
      { name: "Farine 1 kg", qty: 1, unitMinor: 5000, totalMinor: 5000 },
    ]);

    const dep = need(journal.find((r) => r.kind === "expense")?.tx, "dépense");
    if (dep.kind !== "expense") throw new Error("Type de pièce attendu : dépense.");
    expect(dep.payee).toBe("Grossiste Sud");
    expect(dep.category).toBe("Fournitures");
    expect(dep.method).toBe("Espèces");
    expect(dep.reference).toBe("DEP-2026-0007");
    expect(dep.note).toBeNull();

    // Encaissements autonomes (dette réglée hors vente) : rattachés au client,
    // du plus récent au plus ancien.
    const paiements = journal
      .filter((r) => r.kind === "payment")
      .map((r) => r.tx)
      .filter((t): t is Extract<typeof t, { kind: "payment" }> => t.kind === "payment");
    expect(paiements.length).toBe(2);
    expect(paiements.map((t) => [t.amountMinor, t.method])).toEqual([
      [1000, "Chèque"],
      [500, "Espèces"],
    ]);
    for (const t of paiements) {
      expect(t.label).toBe("Amine Benali");
      expect(t.operator).toBe("Nadia Zerrouki");
    }
    // Encaissement autonome (hors vente) : la référence affichée est le libellé
    // de l'encaissement lui-même, jamais une facture inventée.
    for (const row of journal.filter((r) => r.kind === "payment")) {
      expect(row.ref).toBe("Encaissement");
      expect(row.detail).toBe("Encaissement Amine Benali");
    }
    expect(paiements[1]?.note).toBe("Acompte sur ardoise");
    expect(paiements[0]?.note).toBeNull();
    expect(paiements[0]?.reference).toBe("CH-0051");
  });

  it("transporte l'audit de caisse (session ouverte + session fermée à écart non nul)", () => {
    const s = buildOwnerSnapshot(NOW);
    const audit = s.money.audit;
    expect(audit.activeRegisters).toBe(1);
    // Attente live de « Caisse 2 — matin » (ouverte 07:30Z) : fond 2 000 +
    // encaissements autonomes de SA fenêtre (500 + 1 000). La dépense (06:00Z)
    // et le remboursement (07:00Z) précèdent l'ouverture → hors tiroir.
    expect(audit.fundsMinor).toBe(3500);
    expect(s.money.sessions.length).toBe(1);
    const closed = need(s.money.sessions[0], "session fermée");
    expect(closed.status).toBe("closed");
    // 5 000 + 10 200 (S1) + 1 500 − 1 200 − 5 000 = 10 500, figé à la fermeture.
    expect(closed.expectedMinor).toBe(10500);
    expect(closed.countedMinor).toBe(10700);
    expect(closed.varianceMinor).toBe(200);
    expect(closed.post).toBe("Caisse 1");
    expect(closed.operator).toBe("Karim Haddad");
    expect(closed.note).toBe("Surplus de 200 à clarifier");
    expect(audit.varianceNetMinor).toBe(200);
    // Une seule session fermée, non conforme → 0 % de conformité.
    expect(audit.conformityPercent).toBe(0);
    const active = need(s.money.activeSession, "session active");
    expect(active.post).toBe("Caisse 2");
    expect(active.status).toBe("open");
    expect(active.closedAt).toBeNull();
    expect(active.countedMinor).toBeNull();
    expect(active.varianceMinor).toBeNull();
  });

  it("résume les dépenses du mois métier courant, libellées en français", () => {
    const expenses = buildOwnerSnapshot(NOW).money.expenses;
    expect(expenses.monthLabel).toBe("Septembre 2026");
    expect(expenses.totalMinor).toBe(1200);
    expect(expenses.count).toBe(1);
    const row = need(expenses.rows[0], "ligne de dépense");
    expect(row.category).toBe("Fournitures");
    expect(row.label).toBe("Sacs kraft");
    expect(row.amountMinor).toBe(1200);
    expect(row.at).toBe(`${DAY}T06:00:00.000Z`);
  });

  it("décompose la créance par tranche d'ancienneté (la somme vaut le total)", () => {
    const debts = buildOwnerSnapshot(NOW).money.debts;
    expect(debts.count).toBe(1);
    expect(debts.totalMinor).toBe(EXPECT.debtTotalMinor);
    expect(debts.overdueMinor).toBe(EXPECT.debtOverdueMinor);
    expect(debts.rows.length).toBe(1);
    const debtor = need(debts.rows[0], "débiteur");
    const d0to30 = debtor.aging.d0to30Minor;
    const d31to60 = debtor.aging.d31to60Minor;
    const d60plus = debtor.aging.d60plusMinor;
    expect(d0to30).toBe(EXPECT.agingD0to30);
    expect(d31to60).toBe(0);
    expect(d60plus).toBe(EXPECT.agingD60plus);
    expect(d0to30 + d31to60 + d60plus).toBe(debtor.totalMinor);
    // Deux factures échues, dans deux tranches DIFFÉRENTES (8 j et 63 j).
    expect(debtor.lateDays).toBe(63);
    expect(debtor.invoices.map((i) => i.ref)).toEqual(["FAC-0003", "FAC-0004", "FAC-0002"]);
    expect(debtor.invoices.map((i) => i.lateDays)).toEqual([63, 8, 0]);
    const first = need(debtor.invoices[0], "facture la plus ancienne");
    expect(first.totalMinor).toBe(4000);
    expect(first.depositMinor).toBe(1000);
    expect(first.remainingMinor).toBe(3000);
    expect(first.dueAt).toBe("2026-07-01");
    expect(first.issuedAt).toBe("2026-06-01T09:00:00.000Z");
    expect(debtor.name).toBe("Amine Benali");
    expect(debtor.segment).toBe("Créances en retard");
    expect(debtor.phone).toBe("0550112233");
    expect(debtor.code).toBe(`CLT-${String(seededCustomerId).padStart(5, "0")}`);
    expect(debtor.id).toBe(String(seededCustomerId));
    // Jamais inventé : ni manager, ni « plafond à 0 DZD », ni paiement deviné.
    expect(debtor.manager).toBeNull();
    expect(debtor.limitMinor).toBeNull();
    // Dernier encaissement = le plus RÉCENT, pas le plus gros.
    expect(debtor.lastPaymentMinor).toBe(1000);
    expect(debtor.lastPaymentAt).toBe(`${DAY}T09:30:00.000Z`);
    expect(debtor.lastPaymentNote).toBeNull();
  });

  it("donne pour chaque référence une cadence et un réappro calculés", () => {
    const stock = buildOwnerSnapshot(NOW).stock;
    expect(stock.valueMinor).toBe(EXPECT.stockValueMinor);
    expect(stock.references).toBe(4);
    expect(stock.lowCount).toBe(1);
    expect(stock.outCount).toBe(1);
    expect(stock.deadCount).toBe(1);
    expect(stock.lastInventoryAt).toBe(`${DAY}T10:00:00.000Z`);
    // Critiques d'abord : rupture, puis sous-seuil, puis valorisation seule.
    expect(stock.products.map((p) => p.name)).toEqual([
      "Café moulu 250 g",
      "Farine 1 kg",
      "Eau minérale 1,5 L",
      "Sel fin 500 g",
    ]);
    const farine = need(
      stock.products.find((p) => p.name === "Farine 1 kg"),
      "farine",
    );
    expect(farine.sold30).toBe(45); // 43 + 2 + 1 − 1 (retour)
    expect(farine.perDay).toBe(1.5);
    expect(farine.autonomyDays).toBe(4); // 6 / 1,5
    expect(farine.suggestedRestock).toBe(15); // ⌈10 + 1,5×7 − 6⌉
    expect(farine.quantity).toBe(6);
    expect(farine.minLevel).toBe(10);
    expect(farine.valueMinor).toBe(24000);
    expect(farine.purchaseUnitMinor).toBe(4000);
    expect(farine.saleUnitMinor).toBe(5000);
    expect(farine.marginUnitMinor).toBe(1000);
    expect(farine.marginPercent).toBe(25);
    expect(farine.ean).toBe("6190000000017");
    expect(farine.subtitle).toBe("Alimentaire");
    expect(farine.unit).toEqual({ singular: "Pièce", plural: "Pièces" });
    expect(farine.lastInventoryAt).toBe(`${DAY}T10:00:00.000Z`);
    expect(farine.movements.length).toBe(6);
    expect(farine.movements.map((m) => m.kind)).toEqual([
      "inventaire",
      "vente",
      "retour",
      "vente",
      "vente",
      "reception",
    ]);
    expect(farine.movements.map((m) => m.balance)).toEqual([6, 55, 56, 55, 57, 100]);
    expect(farine.movements[0]?.badge).toBe("Régularisation");
    expect(farine.movements[0]?.note).toBe("Inventaire tournant");
    expect(farine.movements[0]?.ref).toBe("INV-0001");
    expect(farine.movements[5]?.badge).toBe("Réception");

    const eau = need(
      stock.products.find((p) => p.name === "Eau minérale 1,5 L"),
      "eau",
    );
    expect(eau.sold30).toBe(11); // 1 (jour) + 10 (S4) ; S3 hors fenêtre
    expect(eau.perDay).toBe(0.37);
    expect(eau.autonomyDays).toBe(811); // arrondi(300 / 0,37)
    expect(eau.suggestedRestock).toBe(0); // stock très largement couvert

    const cafe = need(
      stock.products.find((p) => p.name === "Café moulu 250 g"),
      "café",
    );
    // Sentinelle documentée : aucune vente → JAMAIS Infinity (JSONB exige du JSON strict).
    expect(cafe.sold30).toBe(0);
    expect(cafe.perDay).toBe(0);
    expect(cafe.autonomyDays).toBe(9999);
    expect(cafe.suggestedRestock).toBe(5); // réassort borné au seul seuil minimum
    expect(cafe.valueMinor).toBe(0);
    expect(cafe.ean).toBeNull();
    // Sa seule mouvement est une régularisation d'inventaire (pas une vente).
    const cafeMv = need(cafe.movements[0], "mouvement café");
    expect(cafe.movements.length).toBe(1);
    expect(cafeMv.at).toBe("2026-08-25T09:00:00.000Z");
    expect(cafeMv.kind).toBe("inventaire");
    expect(cafeMv.ref).toBe("INV-0003");
    expect(cafeMv.note).toBe("Péremption");
    expect(cafeMv.badge).toBe("Régularisation");
    expect(cafeMv.qty).toBe(-10);
    expect(cafeMv.balance).toBe(0);

    const sel = need(
      stock.products.find((p) => p.name === "Sel fin 500 g"),
      "sel",
    );
    expect(sel.autonomyDays).toBe(9999);
    expect(sel.suggestedRestock).toBe(0);
    expect(sel.lastInventoryAt).toBeNull();
    // Aucune écriture de stock sur cette référence : liste vide, jamais fausse.
    expect(sel.movements).toEqual([]);
  });

  it("remplit sans trou la série de 30 journées et ses agrégats", () => {
    const p = buildOwnerSnapshot(NOW).periods;
    expect(p.range).toBe(30);
    expect(p.days.length).toBe(30);
    expect(p.days[0]?.date).toBe(WINDOW_FROM);
    expect(p.days[29]?.date).toBe(DAY);
    for (let i = 1; i < p.days.length; i += 1) {
      const prev = need(p.days[i - 1], "veille");
      const cur = need(p.days[i], "lendemain");
      expect(
        Date.parse(`${cur.date}T00:00:00.000Z`) - Date.parse(`${prev.date}T00:00:00.000Z`),
      ).toBe(86_400_000);
    }
    expect(p.days.reduce((sum, d) => sum + d.totalMinor, 0)).toBe(EXPECT.periodTotalMinor);
    // Le 1er septembre reste vide alors que la vente de 00:30 existe : preuve du
    // découpage Africa/Algiers (elle est bucketisée au 2).
    expect(
      need(
        p.days.find((d) => d.date === "2026-09-01"),
        "01/09",
      ).totalMinor,
    ).toBe(0);
    expect(
      need(
        p.days.find((d) => d.date === DAY),
        "02/09",
      ).totalMinor,
    ).toBe(EXPECT.daySalesMinor);
    expect(p.totalMinor).toBe(EXPECT.periodTotalMinor);
    expect(p.tickets).toBe(EXPECT.periodTickets);
    expect(p.basketMinor).toBe(EXPECT.periodBasketMinor);
    expect(p.marginTotalMinor).toBe(EXPECT.periodMarginMinor);
    expect(p.marginPercent).toBe(20.3);
    expect(p.top.map((t) => [t.name, t.qty, t.totalMinor])).toEqual([
      ["Farine 1 kg", 45, 225000],
      ["Eau minérale 1,5 L", 11, 2200],
    ]);
    expect(p.categories.map((c) => c.name)).toEqual(["Alimentaire", "Boissons"]);
    const alim = need(p.categories[0], "catégorie alimentaire");
    const bois = need(p.categories[1], "catégorie boissons");
    expect(alim.salesMinor).toBe(225000);
    expect(alim.profitMinor).toBe(45000);
    expect(alim.marginPercent).toBe(20);
    expect(bois.marginPercent).toBe(50);
    expect(alim.sharePercent + bois.sharePercent).toBe(100);
  });

  it("compte les alertes et n'invente jamais une perte sans cadence mesurée", () => {
    const a = buildOwnerSnapshot(NOW).alerts;
    expect(a.stock.map((x) => [x.productId, x.severity])).toEqual([
      [String(seededProductIdCafé), "critical"],
      [String(seededProductIdFarine), "watch"],
    ]);
    // Rupture sans AUCUNE vente mesurée → perte estimée à 0 (et non un chiffre).
    expect(need(a.stock[0], "alerte rupture").lossPerDayMinor).toBe(0);
    expect(need(a.stock[1], "alerte veilleuse").lossPerDayMinor).toBeNull();
    expect(a.debts).toEqual([
      {
        debtorId: String(seededCustomerId),
        name: "Amine Benali",
        ref: "FAC-0003",
        lateDays: 63,
        remainingMinor: 3000,
      },
    ]);
    expect(a.critical).toBe(1);
    // 1 veilleuse stock + 1 créance en retard + 2 contrôles système à surveiller.
    expect(a.watch).toBe(4);
    expect(a.ok).toBe(1);
    expect(a.anomaliesTitle).toBe("5 anomalies actives");
    const states = Object.fromEntries(a.system.map((c) => [c.id, c.state]));
    expect(states).toEqual({
      "system-integrity": "ok",
      "system-backup": "watch",
      "system-closing": "watch",
    });
    // Le verdict d'intégrité est transporté AVEC son horodatage ; aucune
    // sauvegarde n'existe sur ce poste → null (jamais un « sain » par défaut).
    expect(a.system.map((c) => c.at)).toEqual([
      "2026-09-02T06:00:00.000Z",
      null,
      "2026-08-05T21:00:00.000Z",
    ]);
  });

  it("est déterministe : deux constructions au même instant rendent le même JSON", () => {
    const a: OwnerSnapshot = buildOwnerSnapshot(NOW);
    const b: OwnerSnapshot = buildOwnerSnapshot(NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("refuse un horodatage illisible au lieu de publier une liasse fausse", () => {
    expect(() => buildOwnerSnapshot("ceci-n-est-pas-un-instant")).toThrow(/Horodatage/);
  });
});

// ---------------------------------------------------------------------------
// Semis d'une journée réaliste.
// ---------------------------------------------------------------------------

/** Identifiants SQLite réservés par `seed` (les assertions n'inventent rien). */
let seededProductIdFarine = 0;
let seededProductIdCafé = 0;

function seed(db: DatabaseSync): void {
  const ins = (table: string, row: Record<string, unknown>): void => {
    const keys = Object.keys(row);
    db.prepare(
      `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
    ).run(...keys.map((k): string | number | null => (row[k] ?? null) as string | number | null));
  };
  const idOf = (table: string, column: string, value: unknown): number =>
    Number(
      (
        db
          .prepare(`SELECT id FROM ${table} WHERE ${column} = ?`)
          .get(value as string | number | null) as { id: number | string }
      ).id,
    );
  const meta = {
    created_at: "2026-08-01T08:00:00.000Z",
    updated_at: "2026-08-01T08:00:00.000Z",
  };

  ins("company_profile", {
    id: 1,
    uuid: "company-1",
    company_name: "SARL Veloria",
    commercial_name: "Superette Veloria",
    ...meta,
  });
  ins("staff_users", {
    uuid: "staff-1",
    username: "nadia",
    display_name: "Nadia Zerrouki",
    role: "manager",
    code_hash: "h1",
    code_salt: "s1",
    ...meta,
  });
  ins("staff_users", {
    uuid: "staff-2",
    username: "karim",
    display_name: "Karim Haddad",
    role: "user",
    code_hash: "h2",
    code_salt: "s2",
    ...meta,
  });
  ins("categories", { uuid: "cat-1", name: "Alimentaire", ...meta });
  ins("categories", { uuid: "cat-2", name: "Boissons", ...meta });
  const catAlim = idOf("categories", "name", "Alimentaire");
  const catBois = idOf("categories", "name", "Boissons");
  const nadia = idOf("staff_users", "username", "nadia");
  const karim = idOf("staff_users", "username", "karim");

  ins("suppliers", { uuid: "sup-1", name: "Grossiste Sud", code: "FRS-001", ...meta });
  const supplier = idOf("suppliers", "code", "FRS-001");

  const catalogue = [
    // nom, catégorie, achat, vente, quantité, seuil
    ["Farine 1 kg", catAlim, 4000, 5000, 6, 10],
    ["Eau minérale 1,5 L", catBois, 100, 200, 300, 24],
    ["Café moulu 250 g", catAlim, 900, 1500, 0, 5],
    ["Sel fin 500 g", catBois, 200, 300, 20, 0],
  ] as const;
  for (const [name, categoryId, purchase, selling, quantity, minLevel] of catalogue) {
    ins("products", {
      uuid: `prod-${name}`,
      name,
      category_id: categoryId,
      unit_code: "PIECE",
      purchase_price_minor: purchase,
      selling_price_minor: selling,
      quantity,
      min_stock_level: minLevel,
      stock_status: "in_stock",
      is_active: 1,
      ...meta,
    });
  }
  const farine = idOf("products", "name", "Farine 1 kg");
  const eau = idOf("products", "name", "Eau minérale 1,5 L");
  const café = idOf("products", "name", "Café moulu 250 g");
  const sel = idOf("products", "name", "Sel fin 500 g");
  seededProductIdFarine = farine;
  seededProductIdCafé = café;
  const productName = new Map<number, string>([
    [farine, "Farine 1 kg"],
    [eau, "Eau minérale 1,5 L"],
    [café, "Café moulu 250 g"],
    [sel, "Sel fin 500 g"],
  ]);

  ins("product_barcodes", {
    product_id: farine,
    barcode: "6190000000017",
    is_primary: 1,
    created_at: meta.created_at,
  });

  ins("customers", {
    uuid: "cust-1",
    first_name: "Amine",
    last_name: "Benali",
    search_name: "Amine Benali",
    phone: "0550112233",
    credit_limit_minor: 0,
    outstanding_balance_minor: 0,
    debt_status: "overdue",
    is_over_limit: 0,
    credit_allowed: 1,
    ...meta,
  });
  const c1 = idOf("customers", "uuid", "cust-1");
  seededCustomerId = c1;

  // --- ventes ------------------------------------------------------------
  const sales = [
    // uuid, n°, client, sous-total, total, encaissé, reste, statut, échéance, instant, auteur
    ["s1", "FAC-0001", null, 10200, 10200, 10200, 0, "paid", null, EDGE_IN, nadia],
    [
      "s2",
      "FAC-0002",
      c1,
      5000,
      5000,
      0,
      5000,
      "unpaid",
      "2026-09-30",
      `${DAY}T08:00:00.000Z`,
      nadia,
    ],
    [
      "s3",
      "FAC-0003",
      c1,
      4000,
      4000,
      1000,
      3000,
      "partial",
      "2026-07-01",
      "2026-06-01T09:00:00.000Z",
      karim,
    ],
    [
      "s4",
      "FAC-0004",
      c1,
      2000,
      2000,
      0,
      2000,
      "unpaid",
      "2026-08-25",
      "2026-08-15T09:00:00.000Z",
      karim,
    ],
    [
      "s5",
      "FAC-0005",
      null,
      215000,
      215000,
      215000,
      0,
      "paid",
      null,
      "2026-08-20T09:00:00.000Z",
      nadia,
    ],
  ] as const;
  for (const [
    uuid,
    numero,
    customerId,
    subtotal,
    total,
    paid,
    reste,
    statut,
    due,
    at,
    author,
  ] of sales) {
    ins("sales", {
      uuid,
      invoice_number: numero,
      customer_id: customerId,
      subtotal_minor: subtotal,
      discount_amount_minor: 0,
      total_minor: total,
      amount_paid_minor: paid,
      credit_applied_minor: 0,
      remaining_balance_minor: reste,
      payment_status: statut,
      payment_method: "cash",
      due_date: due,
      created_at: at,
      updated_at: at,
      staff_user_id: author,
    });
  }
  const saleId = (uuid: string): number => idOf("sales", "uuid", uuid);

  const lines = [
    // vente, produit, quantité, prix unitaire, total ligne, COGS, catégorie
    ["s1", farine, 2, 5000, 10000, 8000, catAlim],
    ["s1", eau, 1, 200, 200, 100, catBois],
    ["s2", farine, 1, 5000, 5000, 4000, catAlim],
    ["s3", eau, 20, 200, 4000, 2000, catBois],
    ["s4", eau, 10, 200, 2000, 1000, catBois],
    ["s5", farine, 43, 5000, 215000, 172000, catAlim],
  ] as const;
  for (const [uuid, productId, qty, unit, total, cogs, categoryId] of lines) {
    ins("sale_items", {
      sale_id: saleId(uuid),
      product_id: productId,
      product_name_snapshot: productName.get(productId) ?? "Produit",
      unit_code: "PIECE",
      unit_price_minor: unit,
      purchase_price_minor: 0,
      quantity: qty,
      line_total_minor: total,
      cogs_minor: cogs,
      original_unit_price_minor: unit,
      discount_minor: 0,
      category_id: categoryId,
      unit_factor: 1,
    });
  }

  // --- encaissements -----------------------------------------------------
  ins("sale_payments", {
    uuid: "pay-1",
    sale_id: saleId("s3"),
    customer_id: c1,
    amount_minor: 1000,
    method: "cheque",
    reference: "CH-0045",
    payment_date: "2026-08-20",
    notes: "Règlement partiel",
    created_at: "2026-08-20T10:00:00.000Z",
    staff_user_id: karim,
  });
  ins("sale_payments", {
    uuid: "pay-2",
    sale_id: null,
    customer_id: c1,
    amount_minor: 500,
    method: "cash",
    reference: null,
    payment_date: DAY,
    notes: "Acompte sur ardoise",
    created_at: `${DAY}T09:00:00.000Z`,
    staff_user_id: nadia,
  });
  ins("sale_payments", {
    uuid: "pay-3",
    sale_id: null,
    customer_id: c1,
    amount_minor: 1000,
    method: "cheque",
    reference: "CH-0051",
    payment_date: DAY,
    notes: null,
    created_at: `${DAY}T09:30:00.000Z`,
    staff_user_id: nadia,
  });

  // --- retour client -----------------------------------------------------
  ins("returns", {
    uuid: "ret-1",
    original_sale_id: saleId("s1"),
    original_invoice_number: "FAC-0001",
    customer_id: null,
    total_return_value_minor: 5000,
    amount_refunded_minor: 5000,
    credit_to_customer_minor: 0,
    reason: "Sac percé",
    notes: null,
    return_number: "RET-00001",
    status: "validated",
    refund_method: "cash",
    staff_user_id: karim,
    created_at: `${DAY}T07:00:00.000Z`,
    updated_at: `${DAY}T07:00:00.000Z`,
  });
  ins("return_items", {
    return_id: idOf("returns", "uuid", "ret-1"),
    product_id: farine,
    product_name_snapshot: "Farine 1 kg",
    quantity: 1,
    unit_price_minor: 5000,
    purchase_price_minor: 4000,
    restocked: 1,
    line_total_minor: 5000,
    condition: "good",
    category_id: catAlim,
    cogs_minor: 4000,
    unit_factor: 1,
  });

  // --- dépense -----------------------------------------------------------
  ins("expenses", {
    uuid: "exp-1",
    description: "Sacs kraft",
    category: "Fournitures",
    amount_minor: 1200,
    expense_date: DAY,
    created_at: `${DAY}T06:00:00.000Z`,
    updated_at: `${DAY}T06:00:00.000Z`,
    supplier_id: supplier,
    payment_method: "cash",
    status: "paid",
    reference: "DEP-2026-0007",
    notes: null,
    staff_user_id: nadia,
  });

  // --- stock : réception, couches FIFO, mouvements -----------------------
  ins("stock_intakes", {
    uuid: "intake-1",
    supplier_id: supplier,
    invoice_number: "BL-2026-0101",
    invoice_date: "2026-08-05",
    subtotal_minor: 60000,
    shipping_cost_minor: 0,
    total_minor: 60000,
    status: "committed",
    notes: null,
    created_at: "2026-08-05T08:00:00.000Z",
    updated_at: "2026-08-05T08:00:00.000Z",
    staff_user_id: nadia,
  });
  const intake = idOf("stock_intakes", "uuid", "intake-1");
  const layers = [
    // produit, quantité d'origine, restant, coût, motif, instant
    [farine, 100, 6, 4000, "intake", "2026-08-05T08:00:00.000Z"],
    [eau, 500, 300, 100, "intake", "2026-08-05T08:00:00.000Z"],
    [café, 10, 0, 900, "opening", "2026-08-01T08:00:00.000Z"],
    [sel, 20, 20, 200, "opening", "2026-08-01T08:00:00.000Z"],
  ] as const;
  for (const [productId, original, remaining, cost, reason, at] of layers) {
    ins("inventory_layers", {
      uuid: `layer-${productId}`,
      product_id: productId,
      stock_intake_id: reason === "intake" ? intake : null,
      original_quantity: original,
      remaining_quantity: remaining,
      unit_cost_minor: cost,
      purchase_date: reason === "intake" ? "2026-08-05" : "2026-08-01",
      reason,
      created_at: at,
    });
  }

  const movements = [
    // produit, type, delta, après, référence, entité liée, motif, instant
    [farine, "intake_in", 100, 100, "BL-2026-0101", "intake", null, "2026-08-05T08:10:00.000Z"],
    [farine, "sale_out", -43, 57, "FAC-0005", "sale", null, "2026-08-20T09:00:00.000Z"],
    [farine, "sale_out", -2, 55, "FAC-0001", "sale", null, EDGE_IN],
    [farine, "return_in", 1, 56, "RET-00001", "return", null, `${DAY}T07:00:00.000Z`],
    [farine, "sale_out", -1, 55, "FAC-0002", "sale", null, `${DAY}T08:00:00.000Z`],
    [
      farine,
      "adjust_out",
      -49,
      6,
      "INV-0001",
      "inventory",
      "Inventaire tournant",
      `${DAY}T10:00:00.000Z`,
    ],
    [eau, "intake_in", 500, 500, "BL-2026-0101", "intake", null, "2026-08-05T08:10:00.000Z"],
    [eau, "sale_out", -10, 490, "FAC-0004", "sale", null, "2026-08-15T09:00:00.000Z"],
    [eau, "sale_out", -1, 489, "FAC-0001", "sale", null, EDGE_IN],
    [
      eau,
      "adjust_out",
      -189,
      300,
      "INV-0002",
      "inventory",
      "Casse constatée",
      `${DAY}T09:30:00.000Z`,
    ],
    [café, "adjust_out", -10, 0, "INV-0003", "inventory", "Péremption", "2026-08-25T09:00:00.000Z"],
  ] as const;
  movements.forEach((m, i) => {
    ins("stock_movements", {
      uuid: `mv-${i + 1}`,
      product_id: m[0],
      movement_type: m[1],
      quantity_delta: m[2],
      quantity_after: m[3],
      unit_cost_minor: null,
      related_entity_type: m[5],
      related_entity_id: null,
      reason: m[6],
      notes: null,
      reference: m[4],
      created_at: m[7],
      staff_user_id: nadia,
    });
  });

  // --- sessions de caisse (ADR-170) --------------------------------------
  const caisse1 = openCashSessionAtomic({
    post: "Caisse 1",
    label: "Caisse 1 — journée",
    openingFloatMinor: 5000,
    note: null,
    actorUserId: karim,
    operationId: OP("open-c1"),
    now: "2026-09-01T22:00:00.000Z",
  });
  openCashSessionAtomic({
    post: "Caisse 2",
    label: "Caisse 2 — matin",
    openingFloatMinor: 2000,
    note: null,
    actorUserId: nadia,
    operationId: OP("open-c2"),
    now: `${DAY}T07:30:00.000Z`,
  });
  closeCashSessionAtomic({
    sessionId: caisse1.id,
    countedMinor: 10700,
    note: "Surplus de 200 à clarifier",
    operationId: OP("close-c1"),
    now: `${DAY}T18:00:00.000Z`,
  });

  // --- clôture Z d'une journée SANS pièce — insérée EN DERNIER : le verrou
  //     de période clôturée (migration 0048) refuserait sinon toute écriture
  //     dont l'instant commence par cette date.
  ins("daily_closings", {
    uuid: "closing-1",
    business_date: "2026-08-05",
    opening_balance_minor: 0,
    cash_sales_minor: 0,
    cash_payments_minor: 0,
    customer_collections_minor: 0,
    expenses_minor: 0,
    refunds_minor: 0,
    closing_balance_minor: 0,
    closed_at: "2026-08-05T21:00:00.000Z",
  });
}
