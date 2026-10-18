// Veloria PoS — A3 : garde d'organisation (zéro cycle, couches pures).
// Miroir de docs/STRUCTURE.md §8 — tout ajout d'arête inter-features
// hors liste blanche fait échouer ce test (revue architecte requise).
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      out.push(...walk(p, exts));
    } else if (exts.some((x) => p.endsWith(x))) out.push(p);
  }
  return out;
}

const ALIAS: Record<string, string> = {
  "@features/": "src/features/",
  "@shared/": "src/shared/",
  "@domain/": "src/domain/",
  "@/": "src/",
};

function resolveTarget(imp: string, cur: string): string {
  for (const [k, v] of Object.entries(ALIAS)) {
    if (imp.startsWith(k)) return v + imp.slice(k.length);
  }
  if (imp.startsWith("./") || imp.startsWith("../")) {
    return path.relative(ROOT, path.resolve(path.dirname(cur), imp)).replace(/\\/g, "/");
  }
  return "";
}

// Arêtes inter-features autorisées (sens unique, jamais de store→store).
// settings>staff (ADR-085) : la rubrique Paramètres héberge l'onglet Équipe,
// comme settings>license — staff n'importe jamais settings (zéro cycle).
const ALLOWED: ReadonlySet<string> = new Set([
  "customers>debts",
  "customers>history",
  "customers>returns",
  // products>stock (FIX racine, audit) : le Catalogue délègue ses dialogs
  // dupliqués au Stock (Ajustement + Historique mouvements) — arête
  // unidirectionnelle, zéro cycle (stock n'importe jamais products).
  "products>stock",
  "products>suppliers",
  "sales>customers",
  "settings>license",
  "settings>staff",
  "stock>suppliers",
]);

describe("A3 organisation : graphe features acyclique + couches pures", () => {
  it("aucune arête inter-features hors liste blanche, zéro cycle", () => {
    const files = walk(path.join(SRC, "features"), [".ts", ".tsx"]);
    const edges = new Map<string, Set<string>>();
    const illegal: string[] = [];
    for (const f of files) {
      const txt = fs.readFileSync(f, "utf8");
      const cur = path.relative(ROOT, f).replace(/\\/g, "/");
      const curFeat = cur.split("/")[2] ?? "";
      for (const m of txt.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const t = resolveTarget(m[1] ?? "", f);
        if (!t.startsWith("src/features/")) continue;
        const tFeat = t.split("/")[2] ?? "";
        if (!curFeat || !tFeat || tFeat === curFeat) continue;
        const key = `${curFeat}>${tFeat}`;
        if (!ALLOWED.has(key)) illegal.push(`${cur} -> ${tFeat}`);
        if (!edges.has(curFeat)) edges.set(curFeat, new Set());
        edges.get(curFeat)?.add(tFeat);
      }
    }
    expect(illegal).toEqual([]);
    // Détection de cycle (DFS).
    const adj = new Map<string, string[]>();
    for (const [k, v] of edges) adj.set(k, [...v]);
    const visited = new Set<string>();
    const stack: string[] = [];
    let cycle: string[] | null = null;
    const dfs = (n: string): boolean => {
      if (stack.includes(n)) {
        cycle = [...stack.slice(stack.indexOf(n)), n];
        return true;
      }
      if (visited.has(n)) return false;
      visited.add(n);
      stack.push(n);
      for (const m of adj.get(n) ?? []) if (dfs(m)) return true;
      stack.pop();
      return false;
    };
    for (const n of adj.keys()) if (dfs(n)) break;
    expect(cycle).toBeNull();
  });

  it("domaine pur : aucun import react/electron/sqlite/node", () => {
    const files = walk(path.join(SRC, "domain"), [".ts"]);
    const bad = files.filter((f) =>
      /from 'react'|from "react"|from 'electron'|better-sqlite3|node:|ipcRenderer/.test(
        fs.readFileSync(f, "utf8"),
      ),
    );
    expect(bad).toEqual([]);
  });

  it("electron n'importe jamais src/ (miroirs documentés, parité par tests)", () => {
    const files = walk(path.join(ROOT, "electron"), [".ts"]);
    const bad = files.filter((f) => /from\s+['"][^'"]*src\//.test(fs.readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });

  it("renderer : aucun import Electron/Node/SQLite direct", () => {
    const files = walk(SRC, [".ts", ".tsx"]);
    const bad = files.filter((f) =>
      /from\s+['"]electron['"]|better-sqlite3|ipcRenderer|from ["']node:/.test(
        fs.readFileSync(f, "utf8"),
      ),
    );
    expect(bad).toEqual([]);
  });

  it("mobile isolé : aucun import vers src/ ou electron/", () => {
    const files = walk(path.join(ROOT, "mobile", "src"), [".ts", ".tsx"]);
    const bad = files.filter((f) => {
      const t = fs.readFileSync(f, "utf8");
      return t.includes("src/domain") || t.includes("src/shared") || t.includes("electron/");
    });
    expect(bad).toEqual([]);
  });
});
