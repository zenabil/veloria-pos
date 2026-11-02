// Veloria PoS — E-35 : contrat du jour métier Africa/Algiers (UTC+1 fixe).
// Trois gardes : (1) l'algorithme des jumeaux domaine/main est identique,
// (2) parité JS ↔ SQL — le découpage SQLite doit rendre exactement la même date
// que le domaine, sinon les totaux de caisse et les rapports divergent,
// (3) garde de source — aucun fichier main/renderer ne redécoupe une colonne
// d'instant à la main (`substr(col,1,10)`) ni n'utilise `date('now')` sans le
// modificateur métier.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  addCalendarDays,
  BUSINESS_DAY_OFFSET_MS as DOMAIN_OFFSET_MS,
  businessDayOf,
  businessDayRangeUtc,
  businessMonthStart,
  businessTimeOf,
  businessWallClock,
  nextBusinessDay,
  previousBusinessDay,
  todayBusinessDate,
} from "@/domain/common/business-day.ts";
import * as main from "../../electron/shared/business-day.ts";
import {
  BUSINESS_DAY_SQL_MODIFIER,
  businessDaysAgoSql,
  businessDaySql,
  businessMonthSql,
  businessWeekSql,
  sqlBusinessToday,
} from "../../electron/shared/business-day.ts";
import { formatDateFr as posFormatDateFr } from "@/shared/formatters/format.ts";
import {
  businessDay as mobileBusinessDay,
  formatDateFr as mobileFormatDateFr,
} from "../../mobile/src/format.ts";
import {
  businessDay as ownerBusinessDay,
  formatDateFr as ownerFormatDateFr,
  formatTime as ownerFormatTime,
} from "../../owner/src/format.ts";

// Les bornes 22:59:59.999Z / 23:00:00.000Z sont le cœur du sujet : la journée
// commence à 00:00 d'Alger, soit 23:00 UTC de la veille.
const VECTORS: Array<{ instant: string; day: string; time: string; month: string }> = [
  { instant: "2026-09-01T22:59:59.999Z", day: "2026-09-01", time: "23:59", month: "2026-09" },
  { instant: "2026-09-01T23:00:00.000Z", day: "2026-09-02", time: "00:00", month: "2026-09" },
  { instant: "2026-09-02T00:30:00.000Z", day: "2026-09-02", time: "01:30", month: "2026-09" },
  { instant: "2026-12-31T23:30:00.000Z", day: "2027-01-01", time: "00:30", month: "2027-01" },
  { instant: "2026-01-01T22:30:00.000Z", day: "2026-01-01", time: "23:30", month: "2026-01" },
  { instant: "2024-02-29T23:00:00.000Z", day: "2024-03-01", time: "00:00", month: "2024-03" },
  { instant: "2026-10-25T16:05:00.000Z", day: "2026-10-25", time: "17:05", month: "2026-10" },
  { instant: "2026-09-01", day: "2026-09-01", time: "01:00", month: "2026-09" },
  { instant: "2026-09-01T00:00:00+01:00", day: "2026-09-01", time: "00:00", month: "2026-09" },
];

const TWIN_KEYS = [
  "BUSINESS_DAY_OFFSET_MS",
  "BUSINESS_TIME_ZONE",
  "instantToEpochMs",
  "businessDayOf",
  "todayBusinessDate",
  "businessMonthOf",
  "businessTimeOf",
  "businessWallClock",
  "addCalendarDays",
  "businessMonthStart",
  "previousBusinessDay",
  "nextBusinessDay",
  "businessDayRangeUtc",
] as const;

describe("E-35 : jumeau main/domaine du jour métier", () => {
  it("les deux copies exposent la même surface", () => {
    for (const key of TWIN_KEYS) {
      expect(main, key).toHaveProperty(key);
    }
    expect(main.BUSINESS_TIME_ZONE).toBe("Africa/Algiers");
    expect(main.BUSINESS_DAY_OFFSET_MS).toBe(DOMAIN_OFFSET_MS);
  });

  it("mêmes verdicts sur tous les vecteurs", () => {
    for (const v of VECTORS) {
      expect(main.businessDayOf(v.instant), `day ${v.instant}`).toBe(businessDayOf(v.instant));
      expect(main.businessDayOf(v.instant), `day ${v.instant}`).toBe(v.day);
      expect(main.businessTimeOf(v.instant), `time ${v.instant}`).toBe(v.time);
      expect(main.businessMonthOf(v.instant), `month ${v.instant}`).toBe(v.month);
      expect(main.businessWallClock(v.instant)).toEqual(businessWallClock(v.instant));
      expect(main.businessDayRangeUtc(v.day)).toEqual(businessDayRangeUtc(v.day));
      expect(main.addCalendarDays(v.day, 45)).toBe(addCalendarDays(v.day, 45));
      expect(main.businessMonthStart(v.day)).toBe(businessMonthStart(v.day));
      expect(main.previousBusinessDay(v.day)).toBe(previousBusinessDay(v.day));
      expect(main.nextBusinessDay(v.day)).toBe(nextBusinessDay(v.day));
    }
  });

  it("jour métier du moment présent", () => {
    const now = new Date();
    expect(todayBusinessDate(now)).toBe(businessDayOf(now));
    expect(main.todayBusinessDate(now)).toBe(businessDayOf(now));
  });

  it("entrées illisibles → valeurs vides (aucune exception brute)", () => {
    for (const bad of ["", "  ", "pas-une-date", "2026-13-45"]) {
      expect(businessDayOf(bad), bad).toBe("");
      expect(main.businessDayOf(bad), bad).toBe("");
      expect(businessTimeOf(bad), bad).toBe("");
      expect(addCalendarDays(bad, 1), bad).toBe("");
      expect(businessDayRangeUtc(bad), bad).toEqual({ from: "", toExclusive: "" });
    }
  });

  it("bornes UTC d'une journée métier = 23:00Z de la veille → 23:00Z du jour", () => {
    expect(businessDayRangeUtc("2026-09-02")).toEqual({
      from: "2026-09-01T23:00:00.000Z",
      toExclusive: "2026-09-02T23:00:00.000Z",
    });
  });
});

/** Première colonne d'une requête à scalaire unique (sans assertion non-nulle). */
function scalar(
  db: DatabaseSync,
  sql: string,
  ...params: Array<string | number | bigint | null>
): string {
  const row = db.prepare(sql).get(...params) as Record<string, string | number | null> | undefined;
  const value = row ? Object.values(row)[0] : undefined;
  if (value === undefined || value === null) return "";
  return typeof value === "number" ? String(value) : value;
}

describe("E-35 : parité JS ↔ SQL du découpage", () => {
  const db = new DatabaseSync(":memory:");
  const sqlDay = (instant: string): string =>
    scalar(db, `select date(?, '${BUSINESS_DAY_SQL_MODIFIER}') as d`, instant);
  const sqlMonth = (instant: string): string =>
    scalar(db, `select ${businessMonthSql("?")} as m`, instant);
  const sqlWeek = (value: string): string =>
    scalar(db, `select ${businessWeekSql("?")} as w`, value);

  it("date(col,'+1 hour') == businessDayOf(col) sur les instants stockés", () => {
    for (const v of VECTORS) {
      if (v.instant.includes("+")) continue;
      expect(sqlDay(v.instant), `sql day ${v.instant}`).toBe(v.day);
      expect(sqlDay(v.instant)).toBe(businessDayOf(v.instant));
      expect(sqlMonth(v.instant), `sql month ${v.instant}`).toBe(v.month);
    }
  });

  it("la semaine SQL d'un instant = celle de son jour métier", () => {
    for (const v of VECTORS) {
      if (v.instant.includes("+")) continue;
      expect(sqlWeek(v.instant)).toBe(sqlWeek(v.day));
    }
  });

  it("sqlBusinessToday() == todayBusinessDate()", () => {
    expect(scalar(db, `select ${sqlBusinessToday()} as d`)).toBe(todayBusinessDate());
  });

  it("businessDaysAgoSql(7) == addCalendarDays(aujourd'hui, -7)", () => {
    expect(scalar(db, `select ${businessDaysAgoSql(7)} as d`)).toBe(
      addCalendarDays(todayBusinessDate(), -7),
    );
  });

  it("le filtre par bornes UTC sélectionne exactement la journée métier", () => {
    db.exec(`drop table if exists instant_probe`);
    db.exec(`create table instant_probe (v text primary key)`);
    const instants = [
      "2026-09-01T22:59:59.999Z",
      "2026-09-01T23:00:00.000Z",
      "2026-09-02T22:00:00.000Z",
      "2026-09-02T23:00:00.000Z",
    ];
    const insert = db.prepare(`insert into instant_probe (v) values (?)`);
    for (const v of instants) insert.run(v);
    const { from, toExclusive } = businessDayRangeUtc("2026-09-02");
    const rows = db
      .prepare(`select v from instant_probe where v >= ? and v < ? order by v`)
      .all(from, toExclusive) as Array<{ v: string }>;
    expect(rows.map((r) => r.v)).toEqual(["2026-09-01T23:00:00.000Z", "2026-09-02T22:00:00.000Z"]);
    // Contrôle croisé : le bucket SQL de ces mêmes instants rend bien le jour
    // métier (23:00Z du 1er = minuit d'Alger du 2).
    const bucketed = db
      .prepare(
        `select ${businessDaySql("v")} as d, count(*) as n from instant_probe group by 1 order by 1`,
      )
      .all() as Array<{ d: string; n: number }>;
    expect(bucketed).toEqual([
      { d: "2026-09-01", n: 1 },
      { d: "2026-09-02", n: 2 },
      { d: "2026-09-03", n: 1 },
    ]);
    db.exec(`delete from instant_probe`);
  });

  it("les colonnes date-seule ne sont jamais décalées", () => {
    for (const day of ["2026-09-02", "2026-12-31"]) {
      expect(scalar(db, `select date(?) as d`, day)).toBe(day);
      expect(businessDayOf(day)).toBe(day);
    }
  });
});

// ---------------------------------------------------------------------------
// G-18 : le POS, l'APK client et l'APK propriétaire doivent rendre la MÊME
// journée pour le même instant (trois copies, une seule convention).
// ---------------------------------------------------------------------------

describe("E-35/G-18 : parité des formateurs POS / APK client / APK owner", () => {
  const INSTANTS = [
    "2026-09-01T23:30:00.000Z", // 00:30 du 2 septembre à Alger (le cas de l'audit)
    "2026-09-02T22:59:59.000Z",
    "2026-12-31T23:00:00.000Z",
    "2026-05-01T08:15:00.000Z",
  ];

  it("businessDay(…) des deux APK == businessDayOf(…) du domaine", () => {
    for (const iso of INSTANTS) {
      const expected = businessDayOf(iso);
      expect(mobileBusinessDay(iso), `client ${iso}`).toBe(expected);
      expect(ownerBusinessDay(iso), `owner ${iso}`).toBe(expected);
    }
  });

  it("l'étiquette JJ/MM/AAAA est identique des trois côtés", () => {
    for (const iso of INSTANTS) {
      const expected = mobileFormatDateFr(iso);
      expect(ownerFormatDateFr(iso), `owner ${iso}`).toBe(expected);
      expect(posFormatDateFr(iso), `POS ${iso}`).toBe(expected);
    }
  });

  it("preuve G-18 : une vente à 23:30Z s'affiche le 02/09 partout", () => {
    expect(posFormatDateFr("2026-09-01T23:30:00.000Z")).toBe("02/09/2026");
    expect(mobileFormatDateFr("2026-09-01T23:30:00.000Z")).toBe("02/09/2026");
    expect(ownerFormatDateFr("2026-09-01T23:30:00.000Z")).toBe("02/09/2026");
    // L'heure affichée est l'heure d'Alger (00:30), pas l'heure UTC (23:30).
    expect(ownerFormatTime("2026-09-01T23:30:00.000Z")).toBe("00:30");
  });

  it("une date seule reste une date métier dans les APK", () => {
    expect(mobileBusinessDay("2026-09-02")).toBe("2026-09-02");
    expect(ownerBusinessDay("2026-09-02")).toBe("2026-09-02");
  });
});

// ---------------------------------------------------------------------------
// Garde de source : plus personne ne redécoupe le temps à la main.
// ---------------------------------------------------------------------------

const ROOT = process.cwd();

/** Colonnes d'INSTANT (ISO UTC complet) : leur jour métier exige le décalage. */
const INSTANT_COLUMNS = [
  "created_at",
  "updated_at",
  "closed_at",
  "sent_at",
  "applied_at",
  "expires_at",
] as const;

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, exts));
    else if (exts.some((x) => full.endsWith(x))) out.push(full);
  }
  return out;
}

const TWIN_SOURCES = [
  "electron/shared/business-day.ts",
  "src/domain/common/business-day.ts",
  "src/domain/common/dates.ts",
  "src/shared/dates/dates.ts",
];

function offenders(rel: string): string[] {
  if (TWIN_SOURCES.includes(rel)) return [];
  const bad: string[] = [];
  readSource(rel)
    .split("\n")
    .forEach((line, i) => {
      const text = line.trim();
      if (text.startsWith("*") || text.startsWith("//") || text.startsWith("--")) return;
      for (const col of INSTANT_COLUMNS) {
        if (new RegExp(`substr\\(\\s*(?:\\w+\\.)?${col}\\s*,\\s*1\\s*,\\s*10\\s*\\)`).test(line)) {
          bad.push(`${rel}:${i + 1} — substr(...,1,10) sur ${col} (jour UTC)`);
        }
      }
      if (line.includes("date('now'") && !line.includes("BUSINESS_DAY_SQL_MODIFIER")) {
        bad.push(`${rel}:${i + 1} — date('now') non calé sur le fuseau métier`);
      }
      if (/toISOString\(\)\s*\.\s*slice\(\s*0\s*,\s*(10|7)\s*\)/.test(line)) {
        bad.push(`${rel}:${i + 1} — troncature ISO → date/mois UTC`);
      }
      if (line.includes("todayUtcDate") || line.includes("monthStartUtc")) {
        bad.push(`${rel}:${i + 1} — helper UTC encore utilisé`);
      }
    });
  return bad;
}

function readSource(rel: string): string {
  return fs.readFileSync(path.resolve(ROOT, rel), "utf8");
}

describe("E-35 : garde de source (aucun découpe horaire manuel)", () => {
  it("electron/ ne découpe aucune journée en UTC", () => {
    const found = walk(path.join(ROOT, "electron"), [".ts"]).flatMap((f) =>
      offenders(path.relative(ROOT, f).replace(/\\/g, "/")),
    );
    expect(found).toEqual([]);
  });

  it("src/ ne découpe aucune journée en UTC", () => {
    const found = walk(path.join(ROOT, "src"), [".ts", ".tsx"]).flatMap((f) =>
      offenders(path.relative(ROOT, f).replace(/\\/g, "/")),
    );
    expect(found).toEqual([]);
  });

  it("le modificateur métier est unique et correct", () => {
    expect(BUSINESS_DAY_SQL_MODIFIER).toBe("+1 hour");
    expect(businessDaySql("s.created_at")).toBe("date(s.created_at, '+1 hour')");
    expect(businessWeekSql("s.created_at")).toBe("strftime('%Y-S%W', s.created_at, '+1 hour')");
    expect(businessMonthSql("s.created_at")).toBe("strftime('%Y-%m', s.created_at, '+1 hour')");
  });
});
