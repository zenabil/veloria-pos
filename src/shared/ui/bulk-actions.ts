// Veloria PoS — Shared : exécution en lot (concurrence bornée + progression).
//
// A-15 (P2) : les écrans enchaînaient les appels IPC un par un
// (`for (…) await api.x(...)`) : 200 produits archivés = 200 allers-retours
// séquentiels (plusieurs minutes, aucun retour visuel). En parallèle
// brut, c'est l'inverse : le main est saturé (200 messages IPC d'un coup).
//
// Ici : concurrence BORNÉE (4 par défaut), isolation des erreurs (un élément
// en échec n'arrête pas le lot) et rapport de progression.

export interface BulkOptions<T> {
  /** Appels simultanés (défaut 4). */
  concurrency?: number;
  /** Progression : (traités, total). */
  onProgress?: (processed: number, total: number) => void;
  /** Erreur isolée d'un élément (le lot continue) : (élément, erreur). */
  onError?: (item: T, error: unknown) => void;
}

export interface BulkResult {
  /** Éléments traités sans erreur. */
  done: number;
  /** Éléments en erreur (isolés : le lot continue). */
  failed: number;
  /** Total demandé. */
  total: number;
}

/**
 * Exécute `worker` sur chaque élément avec une concurrence bornée.
 * Une erreur sur un élément est COMPTÉE, jamais propagée : le lot continue
 * (l'appelant décide du message final).
 */
export async function runBulk<T>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<unknown>,
  options: BulkOptions<T> = {},
): Promise<BulkResult> {
  const total = items.length;
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 4, Math.max(total, 1)));
  let cursor = 0;
  let done = 0;
  let failed = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= total) return;
      const item = items[index] as T;
      try {
        await worker(item, index);
        done += 1;
      } catch (error) {
        failed += 1;
        options.onError?.(item, error);
      }
      options.onProgress?.(done + failed, total);
    }
  });
  await Promise.all(runners);
  return { done, failed, total };
}
