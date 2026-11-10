// Veloria PoS — Shared: message d'erreur FR sûr pour l'UI + log technique.
// Règle P1-7 : un message métier (domaine FR ou main via `toUserMessage`) passe
// tel quel ; un message technique brut (TypeError JS, SQLITE, chemins, stack,
// Zod, "Invalid Date", NaN) est JOURNALISÉ (console technique) et remplacé par
// le repli FR contextuel. Ne JAMAIS afficher `err.message` brut à l'utilisateur.
const TECHNICAL_RE =
  /Cannot read|is not a function|is not defined|of undefined|undefined is not|null is not an object|Invalid Date|SQLITE_|UNIQUE constraint|no such (table|column|file|directory)|syntax error|RAISE|ABORT|ENOENT|EACCES|EPERM|ENOSPC|EEXIST|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|ERR_|MODULE_NOT_FOUND|TypeError|RangeError|ReferenceError|SyntaxError|URIError|EvalError|node_modules|\.tsx?:\d+|\.js:\d+|^\s*\[|\binvalid_type\b|\bNaN\b|operation was aborted|this operation was aborted|\baborterror\b/i;

// A-05 (P1) : messages techniques de moteur qui n'étaient pas listés —
// « database is locked », « not a database », « disk I/O error »…
const TECHNICAL_ENGINE_RE =
  /\b(database is locked|not a database|disk I\/O error|readonly database|out of memory|segmentation fault|terminating|connection (refused|reset|closed)|socket hang up|timed? ?out|broken pipe|too many open files|protocol error|bad (file )?descriptor|cannot allocate|address already in use|invalid argument)\b/i;

// E-51 : rejets d'infrastructure (Electron/IPC) et DOM/fetch qui n'étaient
// couverts par AUCUN motif et sortaient donc en anglais à la caisse
// (« Error invoking remote method 'sales.create' … », « Failed to fetch »).
// I-02 : l'abort de l'AbortController du miroir (« This operation was aborted »)
// est technique anglais : il ne doit jamais atteindre l'opérateur.
const TECHNICAL_INFRA_RE =
  /\b(error invoking remote method|no handler registered|could not be cloned|maximum call stack|rangeerror|stack overflow|failed to fetch|networkerror|this operation was aborted|operation was aborted|aborterror|notstructurederror|securityerror|timeouterror|script error|webview|ipc renderer|window is not defined)\b/i;

/** true si le message est technique brut (jamais affichable tel quel). */
export function isTechnicalMessage(msg: string): boolean {
  if (TECHNICAL_RE.test(msg) || TECHNICAL_ENGINE_RE.test(msg) || TECHNICAL_INFRA_RE.test(msg)) {
    return true;
  }
  // I-01 : phrase anglaise non listée (sans accent français) → technique.
  // Un message métier FR authentique porte presque toujours un accent ou un
  // mot français ; une suite de mots anglais sans eux est un moteur.
  if (/[éèêàùüçâîô]/i.test(msg)) return false;
  return /\b(the|this|was|were|has|have|had|from|with|without|failed|invalid|unknown|error|exception)\b/i.test(
    msg,
  );
}

/**
 * Message FR affichable : message métier tel quel, technique → repli + log.
 * `fallback` = message FR contextuel de l'appelant (jamais générique vide).
 */
export function frError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    if (!isTechnicalMessage(err.message)) return err.message;
    try {
      console.error("[Veloria]", err);
    } catch {
      /* journal best effort */
    }
    return fallback;
  }
  if (typeof err === "string") {
    return isTechnicalMessage(err) ? fallback : err;
  }
  return fallback;
}
