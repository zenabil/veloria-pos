// Veloria PoS — Centre de notifications (données réelles : licence, sauvegarde, miroir).
import { useCallback, useState } from "react";
import { api } from "@shared/types/ipc-client.ts";
import { frError } from "@shared/errors/fr-map.ts";
import { backupFrequencyMinutes } from "@domain/backup/backup-rules.ts";
import type { LicenseStatusView } from "@features/license/use-license.ts";

export interface NotifItem {
  tone: "err" | "warn";
  text: string;
}

export function useNotifications(licenseStatus: LicenseStatusView | null): {
  notifOpen: boolean;
  setNotifOpen: (open: boolean) => void;
  notifLoading: boolean;
  notifItems: NotifItem[];
  notifCount: number;
  openNotifications: () => Promise<void>;
} {
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifItems, setNotifItems] = useState<NotifItem[]>([]);

  const openNotifications = useCallback(async (): Promise<void> => {
    setNotifOpen(true);
    setNotifLoading(true);
    const items: NotifItem[] = [];
    const st = licenseStatus;
    if (st?.state === "EXPIRED") {
      items.push({
        tone: "err",
        text: "Licence expirée : écritures bloquées, consultation seule.",
      });
    } else if (st?.state === "EXPIRING_SOON") {
      items.push({
        tone: "warn",
        text: `Licence : expire dans ${st.daysLeft ?? "?"} jour(s). Renouvelez via le vendor.`,
      });
    }
    try {
      const b = (await api.backupStatus()) as {
        lastAt: string | null;
        auto?: { enabled: boolean; frequency?: string; customMinutes?: number } | null;
      };
      if (b.auto?.enabled) {
        const mins = backupFrequencyMinutes(
          (b.auto.frequency ?? "daily") as "daily",
          Number(b.auto.customMinutes ?? 60),
        );
        const lastMs = b.lastAt ? Date.parse(b.lastAt) : Number.NaN;
        if (!Number.isFinite(lastMs) || Date.now() - lastMs >= mins * 60_000) {
          items.push({ tone: "warn", text: "Sauvegarde automatique en retard : lancez-en une." });
        }
      }
    } catch {
      /* statut sauvegarde illisible */
    }
    try {
      const s = (await api.syncGetConfig()) as { lastError: string | null; pendingCount: number };
      if (s.lastError) {
        try {
          console.error("[Veloria] miroir:", s.lastError);
        } catch {
          /* journal best effort */
        }
        items.push({ tone: "err", text: frError(s.lastError, "Miroir Android indisponible.") });
      } else if (Number(s.pendingCount) > 0) {
        items.push({
          tone: "warn",
          text: `${s.pendingCount} cliché(s) en attente vers le miroir.`,
        });
      }
    } catch {
      /* miroir illisible */
    }
    setNotifItems(items);
    setNotifLoading(false);
  }, [licenseStatus]);

  return {
    notifOpen,
    setNotifOpen,
    notifLoading,
    notifItems,
    notifCount: notifItems.length,
    openNotifications,
  };
}
