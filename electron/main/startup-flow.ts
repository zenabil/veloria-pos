// Veloria PoS — Electron main: décision de démarrage liée à la base.
// Module pur (aucun import Electron) : toute la logique de classification est
// testable sans lancer l'application. Le câblage réel vit dans main.ts.
//
// Règle : si la base n'est pas ouvrable ou pas saine, le démarrage est FATAL
// pour la coquille applicative — main.ts doit ouvrir la fenêtre de récupération
// et JAMAIS la fenêtre principale.

export type StartupFailureStage = "open" | "migration" | "version" | "integrity";

export interface DatabaseOpenInfo {
  path: string;
  schemaVersion: number;
}

export interface DatabaseHealthInfo {
  integrity: string;
  foreignKeys: unknown[];
}

export interface StartupFailure {
  stage: StartupFailureStage;
  /** Message FR destiné à l'utilisateur (jamais de stack, jamais de SQL brut). */
  userMessage: string;
  /** Détail technique réservé aux journaux (jamais affiché à l'utilisateur). */
  technical: string;
}

export type StartupAttempt =
  | { status: "ready"; info: DatabaseOpenInfo }
  | { status: "failed"; failure: StartupFailure };

export type StartupMode = "main" | "recovery";

const MSG_OPEN =
  "La base de données est inaccessible. Vos données sont conservées. " +
  "Vous pouvez réessayer, restaurer une sauvegarde ou vérifier l'emplacement de la base.";

const MSG_MIGRATION =
  "La mise à jour de la base de données a échoué. Vos données sont conservées. " +
  "Restaurez une sauvegarde compatible, puis réessayez.";

const MSG_INTEGRITY =
  "La base de données semble endommagée ou incohérente. Vos données sont conservées. " +
  "Restaurez une sauvegarde vérifiée.";

function technicalOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Classe une erreur d'ouverture/migration : le message technique ne quitte
 * jamais ce module vers l'UI (il part uniquement dans les journaux).
 */
export function classifyStartupError(err: unknown): StartupFailure {
  const technical = technicalOf(err);
  if (/checksum mismatch|migration\.applying|migration failed/i.test(technical)) {
    return { stage: "migration", userMessage: MSG_MIGRATION, technical };
  }
  if (/plus récente de Veloria PoS/i.test(technical)) {
    // Déjà rédigé en français côté sqlite.service : réutilisé tel quel.
    return { stage: "version", userMessage: technical, technical };
  }
  return { stage: "open", userMessage: MSG_OPEN, technical };
}

export function integrityFailure(check: DatabaseHealthInfo): StartupFailure {
  const technical = `integrity=${check.integrity} foreign_key_violations=${check.foreignKeys.length}`;
  return { stage: "integrity", userMessage: MSG_INTEGRITY, technical };
}

export interface StartupAttemptDeps {
  openDatabase: () => DatabaseOpenInfo;
  integrityCheck: () => DatabaseHealthInfo;
}

/**
 * Tente d'ouvrir la base puis contrôle son intégrité. Ne lève jamais :
 * tout échec est retourné comme `failed` avec un message FR prêt à afficher.
 */
export function attemptDatabaseStartup(deps: StartupAttemptDeps): StartupAttempt {
  let info: DatabaseOpenInfo;
  try {
    info = deps.openDatabase();
  } catch (err) {
    return { status: "failed", failure: classifyStartupError(err) };
  }
  let check: DatabaseHealthInfo;
  try {
    check = deps.integrityCheck();
  } catch (err) {
    return { status: "failed", failure: classifyStartupError(err) };
  }
  if (check.integrity !== "ok" || check.foreignKeys.length !== 0) {
    return { status: "failed", failure: integrityFailure(check) };
  }
  return { status: "ready", info };
}

export interface StartupOrchestrationDeps extends StartupAttemptDeps {
  enterMainMode: (info: DatabaseOpenInfo) => void;
  enterRecoveryMode: (failure: StartupFailure) => void;
  log: (
    level: "INFO" | "FATAL",
    scope: string,
    event: string,
    data?: Record<string, unknown>,
  ) => void;
}

export interface StartupResolution {
  mode: StartupMode;
  /** Renseigné uniquement en mode `recovery` (message FR déjà prêt à afficher). */
  failure: StartupFailure | null;
}

/**
 * Point d'entrée unique du démarrage : une seule tentative, puis exactement
 * un mode — `main` (base prête) ou `recovery` (échec fatal). La coquille
 * applicative n'est créée que via `enterMainMode`.
 */
export function resolveStartup(deps: StartupOrchestrationDeps): StartupResolution {
  const attempt = attemptDatabaseStartup(deps);
  if (attempt.status === "ready") {
    deps.enterMainMode(attempt.info);
    return { mode: "main", failure: null };
  }
  deps.log("FATAL", "app", "database.startup_failed", {
    stage: attempt.failure.stage,
    error: attempt.failure.technical,
  });
  deps.enterRecoveryMode(attempt.failure);
  return { mode: "recovery", failure: attempt.failure };
}
