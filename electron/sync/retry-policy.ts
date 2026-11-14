// Veloria PoS — SYNC-02 : POLITIQUE de rejeu et de quarantaine de la file
// miroir.
//
// L'audit (2026-11-11, SYNC-02) a constaté que la file de sortie
// (`sync_outbox`) n'avait NI compteur de tentative, NI taxonomie d'échec,
// NI backoff : une ligne rejetée par le miroir était rejouée à CHAQUE tick
// (toutes les 60 s) sans jamais s'arrêter, et une panne réseau transitoire
// était indiscernable d'une erreur de configuration.
//
// Le présent module est PUR (aucun Electron, aucune base) : il porte la
// décision, la base ne porte que l'état. C'est ce qui rend la politique
// testable sans réseau.
//
// TAXONOMIE (veloria-sync, « Outbox and failure taxonomy ») :
//   - `transient`  : réseau, délai dépassé, 429, 5xx → REJEUABLE ;
//   - `auth`       : 401/403 (clé refusée) → ACTION OPÉRATEUR, pas de rejeu
//                     automatique (rejouer ne changera rien) ;
//   - `schema`     : table absente / configuration du projet → la LIGNE n'est
//                     pas en cause : aucune ligne ne doit être condamnée ;
//   - `validation` : rejet de ligne (données incohérentes) → PERMANENT pour
//                     cette ligne → quarantaine ;
//   - `permanent`  : tout autre refus définitif → quarantaine.
//
// RÈGLE : seules les lignes TRANSIENTES sont rejouées, avec un délai
// exponentiel borné et un jitter. Une ligne qui dépasse le budget de
// tentatives est QUARANTAINE (état d'audit, traceable), jamais supprimée et
// jamais bloquante pour les autres lignes.

/** Taxonomie d'un échec de la poussée miroir. */
export type SyncFailureKind = "transient" | "auth" | "schema" | "validation" | "permanent";

/** Budget de tentatives avant QUARANTAINE (rejoues au total). */
export const SYNC_MAX_ATTEMPTS = 8;
/** Délai de base du backoff exponentiel (30 s). */
export const SYNC_BACKOFF_BASE_MS = 30_000;
/** Plafond du backoff exponentiel (1 h). */
export const SYNC_BACKOFF_CAP_MS = 3_600_000;

/** Détails serveur Supabase/PostgREST qui signalent un problème de SCHEMA. */
const SCHEMA_DETAIL_RE =
  /(PGRST205|42P01|does not exist|relation .* does not exist|schema cache|column .* does not exist)/i;
/** Détails qui signalent un rejet de VALEUR (ligne, pas configuration). */
const VALIDATION_DETAIL_RE =
  /(23503|23505|23514|22P02|invalid input|violates|duplicate key|not-null|is not valid)/i;

/**
 * Classe un échec de la poussée. `status` est le code HTTP (null = échec
 * réseau : fetch a levé).
 */
export function classifySyncFailure(status: number | null, detail = ""): SyncFailureKind {
  if (status == null) return "transient";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "schema";
  if (SCHEMA_DETAIL_RE.test(detail)) return "schema";
  if (status === 408 || status === 425 || status === 429) return "transient";
  if (status >= 500) return "transient";
  if (VALIDATION_DETAIL_RE.test(detail)) return "validation";
  if (status >= 400) return "validation";
  return "transient";
}

/** Un échec de cette classe se rejoue-t-il ? */
export function isRetryable(kind: SyncFailureKind): boolean {
  return kind === "transient";
}

/**
 * Délai avant la prochaine tentative (ms), en millisecondes.
 *
 * - exponentiel : base × 2^(tentatives − 1), plafonné à `SYNC_BACKOFF_CAP_MS` ;
 * - jitter : facteur ∈ [0,8 ; 1,2] appliqué au délai — il empêche plusieurs
 *   postes (ou plusieurs lignes) de rejouer en même temps après une panne
 *   réseau commune.
 *
 * `jitter` ∈ [0,1) : 0.5 donne exactement le délai exponentiel (déterministe,
 * utilisé par les tests) ; 0.25 → 0,9× ; 0,75 → 1,1×.
 */
export function backoffDelayMs(attempts: number, jitter = 0.5): number {
  const n = Math.max(1, Math.trunc(attempts));
  const exponential = Math.min(SYNC_BACKOFF_CAP_MS, SYNC_BACKOFF_BASE_MS * 2 ** (n - 1));
  const j = Number.isFinite(jitter) ? Math.min(Math.max(jitter, 0), 0.999999) : 0.5;
  const factor = 0.8 + 0.4 * j;
  return Math.round(exponential * factor);
}

/** La ligne a-t-elle épuisé son budget de tentatives ? */
export function isQuarantined(attempts: number): boolean {
  return Math.max(0, Math.trunc(attempts)) >= SYNC_MAX_ATTEMPTS;
}

/** Instant ISO de la prochaine tentative (backoff + jitter). */
export function nextAttemptAt(nowIso: string, attempts: number, jitter = 0.5): string {
  const base = Date.parse(nowIso);
  const ms = Number.isFinite(base) ? base : Date.now();
  return new Date(ms + backoffDelayMs(attempts, jitter)).toISOString();
}

/**
 * Décision complète pour une ligne en échec : compteur, prochaine tentative,
 * quarantaine. PUR — c'est la fonction que la base applique.
 */
export function decideRetry(args: {
  attempts: number;
  kind: SyncFailureKind;
  nowIso: string;
  jitter?: number;
}): {
  attempts: number;
  kind: SyncFailureKind;
  retryable: boolean;
  quarantined: boolean;
  nextAttemptAt: string | null;
} {
  const attempts = Math.max(0, Math.trunc(args.attempts)) + 1;
  const retryable = isRetryable(args.kind);
  if (!retryable) {
    // Rejet définitif : la ligne est isolée immédiatement (elle ne bloquera
    // jamais les autres, elle cesse simplement de partir).
    return { attempts, kind: args.kind, retryable: false, quarantined: true, nextAttemptAt: null };
  }
  if (isQuarantined(attempts)) {
    return { attempts, kind: args.kind, retryable: true, quarantined: true, nextAttemptAt: null };
  }
  return {
    attempts,
    kind: args.kind,
    retryable: true,
    quarantined: false,
    nextAttemptAt: nextAttemptAt(args.nowIso, attempts, args.jitter),
  };
}
