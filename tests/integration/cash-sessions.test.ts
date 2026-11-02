// Veloria PoS — Sessions de caisse (migration 0059) : ouverture, comptage,
// fermeture, écart, idempotence et fenêtre de journée métier.
// Base migrée réelle (node:sqlite) : ce test prouve l'argent, pas le rendu.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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
}));

vi.mock("../../electron/services/logger", () => ({
  log: () => {},
  initLogger: () => "",
  getLogFile: () => "",
}));

import {
  closeCashSessionAtomic,
  countCashSessionAtomic,
  getCashAuditSummary,
  getActiveCashSession,
  listCashSessions,
  openCashSessionAtomic,
  type CashSessionRow,
} from "../../electron/ipc/handlers/cash-session.repo";

type Row = CashSessionRow;

/**
 * `operationId` UUID déterministe, UNIQUE par graine : haché complet (un
 * préfixe tronqué ferait rejouer l'opération d'une AUTRE session — l'idempotence
 * est littérale sur `operation_id`).
 */
const OP = (seed: string): string => {
  const hex = createHash("sha256").update(`veloria-cash-${seed}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
/** Instant d'ouverture : 2026-09-01T22:00Z = 23:00 heure d'Alger (1er septembre). */
const OPEN_AT = "2026-09-01T22:00:00.000Z";
const CLOSE_AT = "2026-09-02T18:00:00.000Z";

function insertCashSale(db: DatabaseSync, uuid: string, createdAt: string, minor: number): void {
  db.prepare(
    `INSERT INTO sales (uuid, invoice_number, customer_id, subtotal_minor, total_minor,
       amount_paid_minor, credit_applied_minor, remaining_balance_minor, payment_status,
       payment_method, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, 0, 0, 'paid', 'cash', ?, ?)`,
  ).run(uuid, `FAC-${uuid}`, minor, minor, minor, createdAt, createdAt);
}

describe("Sessions de caisse (0059)", () => {
  let tmp: string;
  let db: DatabaseSync;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veloria-cash-"));
    db = new DatabaseSync(path.join(tmp, "cash.sqlite"));
    const migDir = path.join(process.cwd(), "database", "migrations");
    for (const f of fs
      .readdirSync(migDir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      db.exec(fs.readFileSync(path.join(migDir, f), "utf-8"));
    }
    db.exec("PRAGMA foreign_keys=ON;");
    repoDb.current = db;
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      /* déjà fermée */
    }
    repoDb.current = null;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function open(post = "Caisse 1", floatMinor = 5000): Row {
    return openCashSessionAtomic({
      post,
      label: `${post} — ouverture`,
      openingFloatMinor: floatMinor,
      note: null,
      actorUserId: null,
      operationId: OP(`${post}op0001`),
      now: OPEN_AT,
    });
  }

  it("ouvre une session : attente = fond d'ouverture, pas d'écart sans comptage", () => {
    const row = open();
    expect(row.status).toBe("open");
    expect(row.openingFloatMinor).toBe(5000);
    expect(row.expectedMinor).toBe(5000);
    expect(row.countedMinor).toBeNull();
    expect(row.varianceMinor).toBeNull();
    const stored = db
      .prepare(`SELECT expected_minor, closed_at FROM cash_sessions WHERE id = ?`)
      .get(row.id) as { expected_minor: number | null; closed_at: string | null };
    // L'attente n'est JAMAIS figée tant que la session est ouverte.
    expect(stored.expected_minor).toBeNull();
    expect(stored.closed_at).toBeNull();
  });

  /** Session active attendue (jamais de `!` dans les tests). */
  function requireActive(): Row {
    const row = getActiveCashSession(CLOSE_AT);
    if (row === null) throw new Error("Session active attendue, absente.");
    return row;
  }

  it("refus d'ouvrir deux fois le même poste (message FR)", () => {
    open();
    expect(() =>
      openCashSessionAtomic({
        post: "Caisse 1",
        label: "Seconde",
        openingFloatMinor: 0,
        note: null,
        actorUserId: null,
        operationId: OP("secondop0002"),
        now: OPEN_AT,
      }),
    ).toThrow(/déjà ouverte/i);
  });

  it("deux postes ouverts en parallèle = deux tiroirs suivis", () => {
    open("Caisse 1");
    open("Caisse 2", 2000);
    const audit = getCashAuditSummary({ from: "2026-09-01", to: "2026-09-02", now: CLOSE_AT });
    expect(audit.activeRegisters).toBe(2);
    expect(audit.fundsMinor).toBe(7000);
    // `cash.current` rend la plus récente (contrat Owner : une session active).
    expect(requireActive().post).toBe("Caisse 2");
  });

  it("l'attente suit les espèces encaissées dans la fenêtre de la session", () => {
    const row = open();
    insertCashSale(db, "in-window", "2026-09-02T08:00:00.000Z", 3000);
    // Hors fenêtre (avant l'ouverture) : jamais comptée dans cette session.
    insertCashSale(db, "before-window", "2026-09-01T20:00:00.000Z", 9000);
    const live = requireActive();
    expect(live.id).toBe(row.id);
    expect(live.expectedMinor).toBe(8000);
  });

  it("comptage : écart dérivé, la session reste ouverte", () => {
    const row = open();
    insertCashSale(db, "s1", "2026-09-02T08:00:00.000Z", 3000);
    const counted = countCashSessionAtomic({
      sessionId: row.id,
      countedMinor: 7500,
      operationId: OP("countop00001"),
      now: CLOSE_AT,
    });
    expect(counted.expectedMinor).toBe(8000);
    expect(counted.varianceMinor).toBe(-500);
    const status = db.prepare(`SELECT status FROM cash_sessions WHERE id = ?`).get(row.id) as {
      status: string;
    };
    expect(status.status).toBe("open");
  });

  it("fermeture : l'attente est FIGÉE, l'écart devient une trace", () => {
    const row = open();
    insertCashSale(db, "s2", "2026-09-02T08:00:00.000Z", 3000);
    const closed = closeCashSessionAtomic({
      sessionId: row.id,
      countedMinor: 8200,
      note: "Surplus rendu au gérant",
      operationId: OP("closeop00001"),
      now: CLOSE_AT,
    });
    expect(closed.status).toBe("closed");
    expect(closed.expectedMinor).toBe(8000);
    expect(closed.varianceMinor).toBe(200);
    // Une vente postérieure à la fermeture ne change PAS l'attente figée.
    insertCashSale(db, "s3", "2026-09-02T19:00:00.000Z", 4000);
    const after = db
      .prepare(`SELECT expected_minor, counted_minor, note FROM cash_sessions WHERE id = ?`)
      .get(row.id) as { expected_minor: number; counted_minor: number; note: string };
    expect(after.expected_minor).toBe(8000);
    expect(after.counted_minor).toBe(8200);
    expect(after.note).toBe("Surplus rendu au gérant");
    expect(() =>
      closeCashSessionAtomic({
        sessionId: row.id,
        countedMinor: 1,
        note: null,
        operationId: OP("closeop00002"),
        now: CLOSE_AT,
      }),
    ).toThrow(/déjà fermée/i);
  });

  it("rejouer le même operationId ne duplique ni ouverture ni fermeture", () => {
    const first = open();
    const replay = open();
    expect(replay.id).toBe(first.id);
    const rows = db.prepare(`SELECT COUNT(*) AS c FROM cash_sessions`).get() as { c: number };
    expect(rows.c).toBe(1);

    const closedOnce = closeCashSessionAtomic({
      sessionId: first.id,
      countedMinor: 5000,
      note: null,
      operationId: OP("closeop00003"),
      now: CLOSE_AT,
    });
    const closedAgain = closeCashSessionAtomic({
      sessionId: first.id,
      countedMinor: 9999,
      note: null,
      operationId: OP("closeop00003"),
      now: CLOSE_AT,
    });
    // Le rejouement rend le PREMIER résultat (le second comptage n'écrase rien).
    expect(closedAgain.varianceMinor).toBe(closedOnce.varianceMinor);
    const counted = db
      .prepare(`SELECT counted_minor FROM cash_sessions WHERE id = ?`)
      .get(first.id) as { counted_minor: number };
    expect(counted.counted_minor).toBe(5000);
  });

  it("comptage négatif refusé (jamais de tiroir négatif en base)", () => {
    const row = open();
    expect(() =>
      countCashSessionAtomic({
        sessionId: row.id,
        countedMinor: -100,
        operationId: OP("negop000001"),
        now: CLOSE_AT,
      }),
    ).toThrow(/Comptage invalide/i);
  });

  it("la liste suit le JOUR MÉTIER d'ouverture (E-35)", () => {
    // Ouverte à 22:00Z du 1er = 23:00 heure d'Alger → journée métier du 1er.
    open();
    const onDay1 = listCashSessions({ from: "2026-09-01", to: "2026-09-01", now: CLOSE_AT });
    expect(onDay1.rows.length).toBe(1);
    // La même session n'apparaît pas dans la fenêtre du 2…
    const onDay2 = listCashSessions({ from: "2026-09-02", to: "2026-09-02", now: CLOSE_AT });
    expect(onDay2.rows.length).toBe(0);
    // …et une session ouverte à 23:30Z du 1er (00:30 du 2) appartient au 2.
    openCashSessionAtomic({
      post: "Caisse 3",
      label: "Nuit",
      openingFloatMinor: 0,
      note: null,
      actorUserId: null,
      operationId: OP("nightop00001"),
      now: "2026-09-01T23:30:00.000Z",
    });
    const nextDay = listCashSessions({ from: "2026-09-02", to: "2026-09-02", now: CLOSE_AT });
    expect(nextDay.rows.map((r) => r.post)).toEqual(["Caisse 3"]);
  });

  it("audit de caisse : conformité et écart net sur les sessions fermées", () => {
    const a = open("Caisse 1", 5000);
    closeCashSessionAtomic({
      sessionId: a.id,
      countedMinor: 5000,
      note: null,
      operationId: OP("closeop00004"),
      now: CLOSE_AT,
    });
    const b = open("Caisse 2", 1000);
    closeCashSessionAtomic({
      sessionId: b.id,
      countedMinor: 900,
      note: null,
      operationId: OP("closeop00005"),
      now: CLOSE_AT,
    });
    const audit = getCashAuditSummary({ from: "2026-09-01", to: "2026-09-02", now: CLOSE_AT });
    expect(audit.sessions.length).toBe(2);
    expect(audit.activeRegisters).toBe(0);
    expect(audit.activeSession).toBeNull();
    expect(audit.conformityPercent).toBe(50);
    expect(audit.varianceNetMinor).toBe(-100);
  });
});
