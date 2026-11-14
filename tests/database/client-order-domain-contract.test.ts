// Veloria PoS — Contrat du domaine des commandes clients (ADR-182 tranche C).
//
// SLICE-01 / GATE-02 : le module `src/domain/order/client-order.ts` définit une
// MACHINE D'ÉTATS et son en-tête affirme être le « MIROIR EXACT » du trigger
// `trg_client_orders_status_transition` (migration 0063). Cette affirmation
// n'était prouvée par AUCUN test — et la porte de couverture par fichier
// (80/75/88/80) échouait sur ce module (46,66 % des lignes).
//
// Ce fichier ferme les deux trous :
//   1. le CONTRAT du domaine est asserté directement (états, transitions,
//      libellés FR, format de référence) — pas seulement sa parité avec le
//      jumeau main ;
//   2. le MIROIR est PROUVÉ : pour chaque paire (état, état), le trigger SQL
//      et le domaine acceptent exactement la même chose. C'est la propriété
//      que l'en-tête du module revendique, et que rien ne vérifiait.
//
// La base utilisée est RÉELLE (SQLite temporaire avec les migrations), pas un
// mock : le trigger est du SQL, il ne s'exerce que dans une base.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  canTransitionOrder,
  orderStatusLabelFr,
  formatOrderReference,
  ORDER_REFERENCE_PREFIX,
} from "../../src/domain/order/client-order.ts";

const MIG_DIR = path.resolve("database/migrations");

let db: DatabaseSync;
let dbFile: string;

beforeAll(() => {
  dbFile = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "veloria-client-order-")),
    "orders.sqlite",
  );
  db = new DatabaseSync(dbFile);
  db.exec("PRAGMA foreign_keys = ON");
  // Applique les migrations dans l'ordre (idempotent : IF NOT EXISTS partout).
  for (const f of fs
    .readdirSync(MIG_DIR)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
  }
});

afterAll(() => {
  try {
    db.close();
  } catch {
    /* déjà fermée */
  }
  try {
    fs.rmSync(path.dirname(dbFile), { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/**
 * Client parent : `client_orders.customer_id` est NOT NULL REFERENCES
 * customers(id). Un client minimal suffit (la commande n'exerce que le
 * trigger de transition).
 */
let customerSeq = 0;
function insertCustomer(id: number): void {
  db.exec(
    `INSERT INTO customers (id, uuid, first_name, last_name, search_name, created_at, updated_at)
     VALUES (${id}, 'cust-uuid-${id}', 'Client', 'Test', 'client test',
             '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  );
}

/**
 * Insère une commande minimale.
 *
 * La table applique des invariants de FORME (CHECK de migration 0063) :
 *   - `served` exige un `sale_id` (la commande a été encaissée) ;
 *   - `cancelled` exige un `cancel_reason` ;
 *   - les autres états n'ont ni l'un ni l'autre.
 * Le fixture respecte ces formes : on veut exercer le TRIGGER DE TRANSITION,
 * pas les CHECK de forme (déjà couverts par ailleurs).
 */
function insertOrder(id: number, status: string): void {
  customerSeq += 1;
  insertCustomer(customerSeq);
  let saleId: number | null = null;
  if (status === "served") {
    // `served` exige une vente encaissée : on en crée une minimale.
    db.exec(
      `INSERT INTO sales (id, uuid, invoice_number, subtotal_minor, total_minor,
                          amount_paid_minor, remaining_balance_minor, payment_status,
                          created_at, updated_at)
       VALUES (${id}, 'sale-uuid-${id}', 'FAC-2026-${id}', 0, 0, 0, 0, 'paid',
               '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
    );
    saleId = id;
  }
  const cancelReason = status === "cancelled" ? "Annulé par le test." : null;
  db.exec(
    `INSERT INTO client_orders
       (id, uuid, reference, customer_id, status, total_minor, sale_id, cancel_reason,
        created_at, updated_at)
     VALUES (${id}, 'uuid-${id}', 'CMD-2026-0000${id}', ${customerSeq}, '${status}', 0,
             ${saleId === null ? "NULL" : saleId},
             ${cancelReason === null ? "NULL" : `'${cancelReason}'`},
             '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  );
}

describe("domaine commandes clients — contrat", () => {
  it("expose exactement les cinq états de la machine", () => {
    expect([...ORDER_STATUSES]).toEqual(["nouvelle", "preparing", "ready", "served", "cancelled"]);
  });

  it("attribue un libellé FR non vide et distinct à chaque état", () => {
    const labels = ORDER_STATUSES.map((s) => orderStatusLabelFr(s));
    for (const l of labels) {
      expect(l.length).toBeGreaterThan(0);
      expect(l).not.toContain("undefined");
    }
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("traite un changement d'état identique comme un no-op permis", () => {
    for (const s of ORDER_STATUSES) {
      expect(canTransitionOrder(s, s)).toBe(true);
    }
  });

  it("interdit toute transition non listée (et refuse de remonter le flux)", () => {
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (from === to) continue;
        const listed = ORDER_TRANSITIONS[from].includes(to);
        expect(canTransitionOrder(from, to)).toBe(listed);
      }
    }
  });

  it("traite served et cancelled comme TERMINAUX (aucune transition sortante)", () => {
    expect(ORDER_TRANSITIONS["served"]).toEqual([]);
    expect(ORDER_TRANSITIONS["cancelled"]).toEqual([]);
  });

  it("formate la référence CMD-AAAA-NNNNNN et rejette un compteur invalide", () => {
    expect(formatOrderReference("CMD", 2026, 42)).toBe("CMD-2026-00042");
    expect(formatOrderReference("", 2026, 7)).toBe(`${ORDER_REFERENCE_PREFIX}-2026-00007`);
    expect(() => formatOrderReference("CMD", 2026, 0)).toThrow();
    expect(() => formatOrderReference("CMD", 2026, -1)).toThrow();
    expect(() => formatOrderReference("CMD", 2026, 1.5)).toThrow();
  });
});

describe("domaine commandes clients — MIROIR du trigger SQL (0063)", () => {
  it("le trigger et le domaine acceptent EXACTEMENT les mêmes transitions", () => {
    // Le passage à `served` se fait TOUJOURS avec le `sale_id` (la vente est
    // encaissée dans la MÊME transaction — ADR-182 §8). Sans lui, c'est le
    // CHECK de FORME de la table qui refuse (pas le trigger de transition).
    // Le test refait donc ce que fait le produit, sinon il mesurerait autre
    // chose que le miroir annoncé.
    const verdictTrigger = (from: string, to: string): boolean => {
      const id = 9000 + customerSeq;
      insertOrder(id, from);
      try {
        let saleIdClause = "";
        if (to === "served") {
          // La vente est renseignée DANS le même UPDATE (le produit fait
          // de même — ADR-182 §8 : la liaison se fait dans la transaction de
          // la vente). Sans elle, c'est le CHECK de FORME qui refuse, pas
          // le trigger de transition.
          db.exec(
            `INSERT INTO sales (id, uuid, invoice_number, subtotal_minor, total_minor,
                                amount_paid_minor, remaining_balance_minor, payment_status,
                                created_at, updated_at)
             VALUES (${id + 500000}, 'sale-uuid-${id}', 'FAC-S-${id}', 0, 0, 0, 0, 'paid',
                     '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
          );
          saleIdClause = `, sale_id = ${id + 500000}`;
        }
        const reasonClause = to === "cancelled" ? ", cancel_reason = 'annule par le test'" : "";
        db.exec(
          `UPDATE client_orders SET status = '${to}'${saleIdClause}${reasonClause},
             updated_at = '2026-01-02T00:00:00.000Z' WHERE id = ${id}`,
        );
        return true;
      } catch {
        return false;
      } finally {
        try {
          db.exec(`DELETE FROM client_orders WHERE id = ${id}`);
        } catch {
          /* déjà supprimée */
        }
      }
    };

    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (from === to) continue;
        const domainOk = canTransitionOrder(from, to);
        const triggerOk = verdictTrigger(from, to);
        // La propriété revendiquée par le module : le jumeau est EXACT.
        expect(
          triggerOk,
          `transition ${from} -> ${to} : domaine=${domainOk} trigger=${triggerOk}`,
        ).toBe(domainOk);
      }
    }
  });

  it("le trigger refuse une transition depuis un état terminal (preuve directe)", () => {
    insertOrder(9500, "served");
    expect(() =>
      db.exec(
        `UPDATE client_orders SET status = 'preparing', updated_at = '2026-01-02T00:00:00.000Z' WHERE id = 9500`,
      ),
    ).toThrow();
    db.exec(`DELETE FROM client_orders WHERE id = 9500`);
  });

  it("le trigger accepte une transition listée (preuve directe)", () => {
    insertOrder(9501, "nouvelle");
    db.exec(
      `UPDATE client_orders SET status = 'preparing', updated_at = '2026-01-02T00:00:00.000Z' WHERE id = 9501`,
    );
    const row = db.prepare(`SELECT status FROM client_orders WHERE id = 9501`).get() as {
      status: string;
    };
    expect(row.status).toBe("preparing");
    db.exec(`DELETE FROM client_orders WHERE id = 9501`);
  });
});
