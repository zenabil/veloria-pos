// Veloria — Boucle client de bout en bout (DÉMO/ESSAI sur base temporaire).
// Chaîne réelle : migrations SQL → seed → activation (SHA-256 comme le repo) →
// clichés via le CONSTRUCTEUR EXÉCUTÉ du main (`buildSnapshotPayload`, celui
// que `sync_outbox` pousse) → réception APK via syncNow (transport simulé =
// future fonction Edge) → vues + formateurs ar/fr.
// Seul le réseau est simulé ; tout le reste est le vrai code de production.
// ADR-153 (lot C) : l'étape « cliché » ne passe plus par la copie applicative
// jamais branchée — elle exerce la production réelle.
import { describe, expect, it, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const demoDb = vi.hoisted(() => ({ current: null as DatabaseSync | null }));

vi.mock("../../electron/database/sqlite.service", () => ({
  getDb: () => {
    const db = demoDb.current as {
      prepare: (sql: string) => {
        all: (...p: unknown[]) => unknown[];
        get: (...p: unknown[]) => unknown;
        run: (...p: unknown[]) => { changes: number | bigint; lastInsertRowid: number | bigint };
      };
      exec: (sql: string) => void;
    } | null;
    if (!db) throw new Error("Base de test non ouverte.");
    return db;
  },
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

import { buildSnapshotPayload } from "../../electron/ipc/handlers/client-access.repo";
import { syncNow } from "../../mobile/src/api";
import { formatMinor } from "../../mobile/src/format";
import { t } from "../../mobile/src/i18n";
import { toHome } from "../../mobile/src/views";

function openSeeded(tmp: string): DatabaseSync {
  const db = new DatabaseSync(path.join(tmp, "demo.sqlite"));
  db.exec("PRAGMA foreign_keys = ON;");
  const migDir = path.join(process.cwd(), "database", "migrations");
  for (const f of fs
    .readdirSync(migDir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
  }
  db.exec("PRAGMA foreign_keys = ON;");
  // Client Karim : autorisé au crédit, dette 375 000 cts = 3 750,00 DZD.
  db.prepare(
    "INSERT INTO customers (uuid, first_name, last_name, search_name, phone, credit_limit_minor, initial_balance_minor, outstanding_balance_minor, debt_status, credit_allowed, settlement_day, created_at, updated_at) VALUES ('ckarim','Karim','Ziani','karim ziani','0550123456',1000000,0,375000,'due',1,14,'2026-09-01','2026-09-29')",
  ).run();
  const sales: [string, string, number, number, number, string, number][] = [
    // uuid, numéro, total, payé, reste, statut, annulée
    ["s1", "FAC-2026-0101", 500000, 500000, 0, "paid", 0],
    ["s2", "FAC-2026-0102", 400000, 200000, 200000, "partial", 0],
    ["s3", "FAC-2026-0103", 350000, 175000, 175000, "partial", 0],
    ["s4", "FAC-2026-0104", 90000, 0, 90000, "unpaid", 1],
  ];
  for (const [u, num, tot, paid, rest, st, cx] of sales) {
    db.prepare(
      "INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor, amount_paid_minor, remaining_balance_minor, payment_status, is_cancelled, created_at, updated_at) VALUES (?,?,1,?,?,?, ?,?,?,'2026-09-10','2026-09-10')",
    ).run(u, num, tot, tot, paid, rest, st, cx);
  }
  const sid = (n: string): number =>
    (db.prepare("SELECT id FROM sales WHERE uuid = ?").get(n) as { id: number }).id;
  const items: [string, string, number, number, number][] = [
    // vente, produit, prix, qté, total ligne
    ["s1", "Sucre 1kg", 9000, 20, 180000],
    ["s1", "Huile 5L", 320000, 1, 320000],
    ["s2", "Sucre 1kg", 9000, 30, 270000],
    ["s2", "Farine 10kg", 130000, 1, 130000],
    ["s3", "Huile 5L", 325000, 1, 325000],
    ["s3", "Café 250g", 25000, 1, 25000],
  ];
  for (const [s, name, price, qty, tot] of items) {
    db.prepare(
      "INSERT INTO sale_items (sale_id, product_name_snapshot, unit_code, unit_price_minor, purchase_price_minor, quantity, line_total_minor) VALUES (?,?,?,?,?,?,?)",
    ).run(sid(s), name, "PIECE", price, 0, qty, tot);
  }
  const pays: [string, number, string, string][] = [
    ["p1", 500000, "cash", "2026-09-11"],
    ["p2", 200000, "transfer", "2026-09-20"],
    ["p3", 175000, "cash", "2026-09-28"],
  ];
  for (const [u, amt, m, d] of pays) {
    db.prepare(
      "INSERT INTO sale_payments (uuid, sale_id, customer_id, amount_minor, method, payment_date, created_at) VALUES (?,NULL,1,?,?,?,?)",
    ).run(u, amt, m, d, d);
  }
  return db;
}

const sha = (v: string): string => createHash("sha256").update(v, "utf8").digest("hex");

describe("Essai APK : boucle locale complète", () => {
  it("tفعيل → cliché → réception → écrans (données affichées ci-dessous)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-demo-"));
    try {
      const db = openSeeded(tmp);
      // 1) Activation commerçant (même SQL que le repo : condensats + 1 ligne).
      db.prepare(
        "INSERT INTO customer_access (customer_id, phone_hash, pin_hash, qr_secret_hash, revoked_at, failed_attempts, locked_until, created_at, updated_at) VALUES (1,?,?,?,NULL,0,NULL,?,?)",
      ).run(
        sha("0550123456"),
        sha("482916"),
        sha("QR-UNIQUE-12345678"),
        "2026-09-29",
        "2026-09-29",
      );
      const ax = db
        .prepare("SELECT COUNT(*) AS c FROM customer_access WHERE customer_id = 1")
        .get() as { c: number };
      expect(ax.c).toBe(1);

      // 2) Clichés via le producteur EXÉCUTÉ (celui de `sync_outbox`).
      demoDb.current = db;
      const NOW = "2026-09-29T10:00:00.000Z";
      const build = (kind: "customer_snapshot" | "invoice_list" | "payment_list"): string =>
        buildSnapshotPayload(1, kind, null, "2026-09", NOW);
      const snap = JSON.parse(build("customer_snapshot")) as {
        lastSales: { id: number }[];
        loyaltyPoints: number;
        topProducts: { name: string }[];
        monthPurchasesMinor: number;
        monthPaymentsMinor: number;
      };
      expect(snap.lastSales.map((s) => s.id)).toEqual([3, 2, 1]);
      expect(snap.loyaltyPoints).toBe(12); // 1 250 000 / 100 000
      expect(snap.topProducts[0]?.name).toBe("Sucre 1kg");
      expect(snap.monthPurchasesMinor).toBe(1250000);
      expect(snap.monthPaymentsMinor).toBe(875000);

      // 3) Miroir simulé (future fonction Edge) + réception APK réelle — les
      // trois charges viennent du même producteur que la file d'attente.
      const mirror = {
        snapshot: JSON.parse(build("customer_snapshot")) as Record<string, unknown>,
        invoices: JSON.parse(build("invoice_list")) as Record<string, unknown>,
        payments: JSON.parse(build("payment_list")) as Record<string, unknown>,
      };
      interface EdgeRes {
        ok: boolean;
        status: number;
        json: () => Promise<unknown>;
        text: () => Promise<string>;
      }
      const edgeFetch = (
        _url: string,
        _init: { method: string; headers: Record<string, string>; body: string },
      ): Promise<EdgeRes> =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              ok: true,
              data: { ...mirror, syncedAt: "2026-09-29T10:00:00.000Z" },
            }),
          text: () => Promise.resolve(""),
        });
      const received = await syncNow(
        "https://demo.supabase.co",
        "anon",
        "0550123456",
        "482916",
        edgeFetch,
      );
      const home = toHome(received.snapshot);

      // 4) Ce que Karim voit sur son téléphone :
      console.log("─── ACCUEIL (ar) ───");
      console.log(`${t("ar", "debtRemaining")} : ${formatMinor(home.debtMinor, "ar")}`);
      console.log(`achats du mois : ${formatMinor(home.monthPurchasesMinor, "ar")}`);
      console.log(`points : ${home.loyaltyPoints} (${t("ar", "loyaltyHint")})`);
      console.log(`top produit : ${home.topProducts[0]?.name} ×${home.topProducts[0]?.quantity}`);
      console.log("─── ACCUEIL (fr) ───");
      console.log(`${t("fr", "debtRemaining")} : ${formatMinor(home.debtMinor, "fr")}`);
      expect(home.debtMinor).toBe(375000);
      expect(home.monthPaymentsMinor).toBe(875000);
      expect(received.invoices).toBeDefined();
      db.close();
    } finally {
      // Windows : suppression best-effort (un verrou transitoire ne doit pas
      // faire échouer la démo ; l'OS purge ses temporaires).
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* nettoyage best-effort */
      }
    }
  });
});
