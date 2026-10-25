// Veloria PoS — Contrats statiques du bridge (sans Electron) :
// - chaque canal IPC est exposé par le preload (pas de canal mort) ;
// - le preload ne touche ni fs/sqlite/enfant-processus ni SQL générique ;
// - chaque EXPORT de validateur Zod est consommé (pas de schéma mort).
//
// W4 (audit 2026-10-19) — G-04 / G-05 / G-06 :
//   - G-04 : la garde ne portait que sur les noms `*Schema` ⇒ 8 exports Zod
//     de `validators.common.ts` échappaient à tout contrôle. On extrait
//     désormais TOUS les exports consts des 12 modules de validation.
//   - G-05 : le seuil `toBeGreaterThan(10)` était tautologique (le vrai
//     compte est 127) ⇒ le nombre d'exports est désormais GELÉ (127) : un
//     export ajouté ou retiré sans mise à jour du contrat fait échouer.
//   - G-06 : les exemptions à la main n'étaient pas justifiées ⇒ chaque
//     exemption porte une raison ET le test vérifie que le schéma parent
//     qui la consomme existe réellement dans le source.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string): string => fs.readFileSync(path.join(root, p), "utf-8");

function channels(): string[] {
  return [...read("electron/ipc/channels.ts").matchAll(/"([a-z0-9.]+)":/g)].map((m) => m[1] ?? "");
}

/** Les 12 modules de validation (le baril `validators.ts` ne fait que
 *  ré-exporter : il ne consomme rien). */
const VALIDATOR_MODULES = [
  "validators.common.ts",
  "validators.catalog.ts",
  "validators.customers.ts",
  "validators.sales.ts",
  "validators.documents.ts",
  "validators.finance.ts",
  "validators.stock.ts",
  "validators.staff.ts",
  "validators.settings.ts",
  "validators.print.ts",
  "validators.templates.ts",
];

/** Consommateurs : les registres IPC, l'impression, la sauvegarde, l'OCR. */
function consumerSources(): string {
  const registryFiles = [
    "electron/ipc/registry.ts",
    "electron/ipc/registry.core.ts",
    "electron/ipc/registry.recovery.ts",
    "electron/ipc/registry.catalog.ts",
    "electron/ipc/registry.sales.ts",
    "electron/ipc/registry.customers.ts",
    "electron/ipc/registry.finance.ts",
    "electron/ipc/registry.stock.ts",
    "electron/ipc/registry.staff.ts",
    "electron/ipc/registry.documents.ts",
    "electron/ipc/registry.system.ts",
    "electron/ipc/handle.ts",
    "electron/ipc/credit-gates.ts",
  ];
  const printingDir = path.join(root, "electron/printing");
  const printing = fs
    .readdirSync(printingDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => read(path.join("electron/printing", f)))
    .join("\n");
  return [
    ...registryFiles.map(read),
    printing,
    read("electron/backup/backup.service.ts"),
    read("electron/ocr/ocr.service.ts"),
  ].join("\n");
}

/**
 * G-06 : schémas NESTED — jamais passés tels quels au bridge, ils sont
 * COMPOSÉS dans un schéma parent de leur propre module. Chaque exemption
 * porte une raison vérifiable (le test exige que la composition existe).
 */
const NESTED_WITH_REASON: Record<string, string> = {
  saleItemSchema: "composé dans saleCreateSchema (z.array(saleItemSchema)) — validators.sales.ts",
  cartLineSchema: "composé dans cartsSaveSchema (z.array(cartLineSchema)) — validators.sales.ts",
  purchaseLineSchema: "composé dans purchaseCreateSchema — validators.stock.ts",
  printLineSchema: "composé dans printPayloadSchema — validators.print.ts",
  labelItemSchema: "composé dans labelsSchema (z.array(labelItemSchema)) — validators.print.ts",
  labelFormatSchema: "champ `format` de labelsSchema (défaut 45x20) — validators.print.ts",
  templateDocTypeSchema: "champ `docType` des schémas de gabarit — validators.templates.ts",
  templatePaperSchema: "champ `paper` des schémas de gabarit (défaut A4) — validators.templates.ts",
};

/** G-05 : nombre d'exports GELÉ (121 schémas + 6 aides hors `*Schema`). */
// ADR-130 (2026-10-21) : 127 → 128 (customersImportSchema).
// ADR-132 (2026-10-22) : 128 → 129 (moneyMinorSigned — remise signée).
// ADR-136 (2026-10-25) : 131 → 134 (3 schémas packaging produit).
const FROZEN_EXPORT_COUNT = 134;

describe("Preload bridge shape", () => {
  it("exposes every IPC channel", () => {
    const pre = read("electron/preload/preload.ts");
    for (const c of channels()) {
      expect(pre.includes(`"${c}"`), `canal manquant dans preload: ${c}`).toBe(true);
    }
  });

  it("denies unsafe APIs in preload", () => {
    const pre = read("electron/preload/preload.ts");
    for (const banned of ["child_process", "better-sqlite3", "node:fs", "run-sql", "execute("]) {
      expect(pre.includes(banned), `API interdite dans preload: ${banned}`).toBe(false);
    }
  });

  it("G-05 : le nombre d'exports de validation est gelé", () => {
    let total = 0;
    for (const m of VALIDATOR_MODULES) {
      const text = read(`electron/ipc/${m}`);
      total += [...text.matchAll(/^export const (\w+)/gm)].length;
    }
    expect(total).toBe(FROZEN_EXPORT_COUNT);
  });

  it("G-04 : aucun export de validateur n'est mort", () => {
    const consumers = consumerSources();
    // Un module de validation consomme les exports d'un AUTRE module de
    // validation (ex. `moneyMinor` défini dans common, utilisé partout).
    const moduleTexts = new Map<string, string>(
      VALIDATOR_MODULES.map((m) => [m, read(`electron/ipc/${m}`)]),
    );
    const dead: string[] = [];
    const localOnly: string[] = [];
    for (const [m, text] of moduleTexts) {
      const names = [...text.matchAll(/^export const (\w+)/gm)].map((x) => x[1] ?? "");
      const otherModules = [...moduleTexts]
        .filter(([k]) => k !== m)
        .map(([, t]) => t)
        .join("\n");
      for (const name of names) {
        const usedElsewhere =
          new RegExp(`\\b${name}\\b`).test(consumers) ||
          new RegExp(`\\b${name}\\b`).test(otherModules);
        // Usage dans son propre module (composition) : le nom apparaît plus
        // d'une fois (définition + consommation).
        const occurrences = (text.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
        if (!usedElsewhere) {
          localOnly.push(name);
          if (occurrences < 2) dead.push(name);
        }
      }
    }
    // Zéro export mort : la liste complète est consommée (invariant dur).
    expect(dead).toEqual([]);
    // Les exports « module-local » (schémas NESTED) sont documentés un par un.
    expect([...localOnly].sort()).toEqual(Object.keys(NESTED_WITH_REASON).sort());
  });

  it("G-06 : chaque exemption nested est consommée par un schéma parent réel", () => {
    const validators = VALIDATOR_MODULES.map((m) => read(`electron/ipc/${m}`)).join("\n");
    expect(validators.includes("z.array(saleItemSchema)")).toBe(true);
    expect(validators.includes("z.array(cartLineSchema)")).toBe(true);
    expect(validators.includes("z.array(purchaseLineSchema)")).toBe(true);
    expect(validators.includes("z.array(printLineSchema)")).toBe(true);
    expect(validators.includes("z.array(labelItemSchema)")).toBe(true);
    for (const [name, reason] of Object.entries(NESTED_WITH_REASON)) {
      expect(reason.length, `raison manquante pour ${name}`).toBeGreaterThan(20);
      // Le nom doit apparaître dans au moins deux modules (définition + usage)
      // ou deux fois dans le sien (définition + composition).
      const occurrences = (validators.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length;
      expect(occurrences, `${name} : export mort déguisé`).toBeGreaterThanOrEqual(2);
    }
  });
});
