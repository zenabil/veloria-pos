// Veloria PoS — Shared UI: identifiant d'opération stable par dialogue (R8).
// Cause racine D5 : 15 slices généraient `newOperationId()` INLINE à chaque
// appel (chaque retry = NOUVELLE opération → double-clic = 2 effets distincts
// acceptés par le main, contrairement à l'intention retry). Seules
// vente/stock figeaient l'UUID à l'ouverture (`payOperationId`).
// Correctif radical : UN hook — l'UUID naît à l'ouverture du dialogue
// (montage), survit aux retries, ne se régénère que sur action explicite
// (`regen`, ex. après succès + nouveau formulaire). Règle : tout dialogue
// mutatif utilise ce hook, jamais `newOperationId()` inline dans un handler.

import { useCallback, useRef, useState } from "react";
import { newOperationId } from "@domain/common/ids.ts";

export function useOperationId(): {
  operationId: string;
  regen: () => string;
} {
  const [operationId, setOperationId] = useState<string>(() => newOperationId());
  const regen = useCallback(() => {
    const next = newOperationId();
    setOperationId(next);
    return next;
  }, []);
  return { operationId, regen };
}

/**
 * Variante liée au CONTENU (M-1, caisse/proformas) : la clé d'entrée est une
 * empreinte de l'intention soumise (`JSON.stringify` du payload, ou `<action>:<id>`
 * pour une cible fixe). Deux clics / un retry après timeout = MÊME clé = MÊME
 * `operationId` → le main rejoue le résultat stocké (`idempotency_keys`) au lieu
 * de dupliquer la mutation. Clé nouvelle (contenu édité, autre ligne, autre
 * montant) = UUID NEUF : la correction est réellement commitée au lieu de
 * rejouer le payload précédent.
 *
 * Chaque clé garde SON UUID tant que le composant vit (des actions distinctes —
 * `cancel` puis `modify` puis `cancel` — ne s'évincent pas mutuellement : le
 * deuxième `cancel` reconduit l'UUID du premier, il ne rouvre pas une opération
 * neuve). Cache réinitialisé au démontage : une réouverture de dialogue est une
 * nouvelle intention, donc une nouvelle opération.
 */
export function useContentOperationId(): (key: string) => string {
  const cache = useRef(new Map<string, string>());
  return useCallback((key: string) => {
    const known = cache.current.get(key);
    if (known != null) return known;
    const fresh = newOperationId();
    cache.current.set(key, fresh);
    return fresh;
  }, []);
}
