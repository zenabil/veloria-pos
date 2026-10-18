// Veloria PoS — Shared UI: identifiant d'opération stable par dialogue (R8).
// Cause racine D5 : 15 slices généraient `newOperationId()` INLINE à chaque
// appel (chaque retry = NOUVELLE opération → double-clic = 2 effets distincts
// acceptés par le main, contrairement à l'intention retry). Seules
// vente/stock figeaient l'UUID à l'ouverture (`payOperationId`).
// Correctif radical : UN hook — l'UUID naît à l'ouverture du dialogue
// (montage), survit aux retries, ne se régénère que sur action explicite
// (`regen`, ex. après succès + nouveau formulaire). Règle : tout dialogue
// mutatif utilise ce hook, jamais `newOperationId()` inline dans un handler.

import { useCallback, useState } from "react";
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
