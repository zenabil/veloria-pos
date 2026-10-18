// Veloria PoS — Feature Licence : état d'activation côté renderer.
// Lecture seule via le bridge (décisions réelles côté main).
// Le renderer n'accorde JAMAIS de permission : hasPageAccess/hasFeature ne
// servent qu'à l'affichage (sidebar, gardes de route). Tout contournement
// (React State, localStorage) est sans effet : le main revérifie le payload
// signé à chaque IPC sensible.

import { useCallback, useEffect, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { frError } from "@shared/errors/fr-map.ts";
import type { Notify } from "@shared/ui/primitives.tsx";

export interface LicenseStatusView {
  state: string;
  enforcementActive: boolean;
  licenseId: string | null;
  edition: string | null;
  licenseType: string | null;
  plan: string | null;
  clientId: string | null;
  clientName: string | null;
  storeName: string | null;
  maxDevices: number | null;
  deviceBinding: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
  features: string[];
  pages: Record<string, boolean>;
  hardwareShort: string;
  lastVerifyUtc: string | null;
}

export function useLicense(notify?: Notify): {
  status: LicenseStatusView | null;
  refresh: () => void;
  hasPageAccess: (page: string) => boolean;
  hasFeature: (feature: string) => boolean;
} {
  const [status, setStatus] = useState<LicenseStatusView | null>(null);
  const refresh = useCallback(() => {
    api
      .licenseStatus()
      .then((s) => setStatus(normalize(s as RawLicenseStatus)))
      .catch((e: unknown) => {
        // Règle 6 : un échec IPC ne doit jamais masquer les modules en
        // silence — message FR + journal technique (frError journalise).
        notify?.(frError(e, "Licence indisponible."), "err");
      });
  }, [notify]);
  useEffect(() => {
    refresh();
  }, [refresh]);
  const hasPageAccess = useCallback(
    (page: string): boolean => {
      if (!status) return false;
      // Poste expiré : consultation seule des pages autorisées (le main
      // bloque les mutations). Affichage uniquement — décision côté main.
      if (
        status.state !== "ACTIVE" &&
        status.state !== "EXPIRING_SOON" &&
        status.state !== "EXPIRED"
      ) {
        return false;
      }
      // Enveloppes legacy sans pages : tout autorisé (compatibilité).
      if (Object.keys(status.pages).length === 0) return true;
      return status.pages[page] === true;
    },
    [status],
  );
  const hasFeature = useCallback(
    (feature: string): boolean => {
      if (!status) return false;
      if (status.state !== "ACTIVE" && status.state !== "EXPIRING_SOON") return false;
      return status.features.includes(feature);
    },
    [status],
  );
  return { status, refresh, hasPageAccess, hasFeature };
}

/** Réponse IPC brute : les champs récents peuvent manquer (robustesse). */
type RawLicenseStatus = Omit<
  LicenseStatusView,
  | "plan"
  | "clientId"
  | "clientName"
  | "storeName"
  | "maxDevices"
  | "deviceBinding"
  | "pages"
  | "features"
> & {
  plan?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  storeName?: string | null;
  maxDevices?: number | null;
  deviceBinding?: boolean;
  pages?: Record<string, boolean>;
  features?: string[];
};

/** Normalise les statuts legacy (enveloppes sans pages/features). */
function normalize(s: RawLicenseStatus): LicenseStatusView {
  return {
    ...s,
    plan: s.plan ?? null,
    clientId: s.clientId ?? null,
    clientName: s.clientName ?? null,
    storeName: s.storeName ?? null,
    maxDevices: s.maxDevices ?? null,
    deviceBinding: s.deviceBinding !== false,
    pages: s.pages ?? {},
    features: Array.isArray(s.features) ? s.features : [],
  };
}
