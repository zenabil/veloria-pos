// Veloria PoS — OBS-02 : BUNDLE DE SUPPORT (lecture seule, sanitisé).
//
// Un bundle de support est un document JSON auto-descriptif qu'un gérant peut
// transmettre au support technique. Il contient UNIQUEMENT des données
// diagnostic (version, schéma, santé, taille, OS, statut des sauvegardes, fin
// de journal RÉDACTÉ). Il ne contient JAMAIS de données métier (ventes,
// clients, stock) ni de secret — c'est le contrat de `docs/BACKUP_CONTRACT.md`
// étendu aux diagnostics.
//
// L'aperçu (preview) est la valeur renvoyée par `app.diagnostics` sous la
// clé `supportBundle` : le gérant la VOIT avant de la copier/exporter.

import fs from "node:fs";
import os from "node:os";

import { redactValue } from "./logger";

export interface SupportBundleInput {
  appVersion: string;
  schemaVersion: number;
  integrity: string;
  foreignKeyViolations: number;
  dbSize: number;
  sqliteVersion: string | null;
  logFile: string;
}

export function buildSupportBundle(input: SupportBundleInput): string {
  let logTail: string[] = [];
  try {
    if (input.logFile) {
      const raw = fs.readFileSync(input.logFile, "utf-8");
      const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
      logTail = lines.slice(-50).map((line) => {
        try {
          const obj = JSON.parse(line) as unknown;
          return JSON.stringify(redactValue(obj));
        } catch {
          return "[ligne illisible]";
        }
      });
    }
  } catch {
    logTail = [];
  }

  const bundle = {
    generatedAt: new Date().toISOString(),
    app: { version: input.appVersion, os: `${os.platform()} ${os.release()} (${os.arch()})` },
    database: {
      schemaVersion: input.schemaVersion,
      integrity: input.integrity,
      foreignKeyViolations: input.foreignKeyViolations,
      sizeBytes: input.dbSize,
      sqliteVersion: input.sqliteVersion,
    },
    logs: { file: input.logFile ? "veloria-*.log" : "(aucun)", tail: logTail },
  };
  return JSON.stringify(bundle, null, 2);
}
