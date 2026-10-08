// Veloria PoS — Badge licence (§12–§15) : état visible, texte + couleur,
// modal d'information (données non sensibles uniquement).
import { useState } from "react";
import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { Badge, Button, InfoRow } from "@shared/ui/primitives.tsx";
import { LICENSE_CRITICAL_DAYS, LICENSE_WARNING_DAYS } from "./catalog.ts";
import { editionLabel, formatDateFr } from "@shared/formatters/format.ts";
import type { LicenseStatusView } from "./use-license.ts";

type BadgeKind = "green" | "amber" | "red" | "grey";

interface BadgeState {
  text: string;
  tone: BadgeKind;
}

/** État du badge : texte explicite + couleur (jamais la couleur seule). */
export function licenseBadgeState(status: LicenseStatusView | null): BadgeState {
  if (!status) return { text: "LICENCE…", tone: "grey" };
  switch (status.state) {
    case "ACTIVE": {
      const days = status.daysLeft;
      if (typeof days === "number" && Number.isFinite(days)) {
        if (days <= LICENSE_CRITICAL_DAYS) {
          return { text: `EXPIRATION DANS ${days} J`, tone: "amber" };
        }
        if (days <= LICENSE_WARNING_DAYS) {
          return { text: "EXPIRATION BIENTÔT", tone: "amber" };
        }
      }
      return { text: "LICENCE ACTIVE", tone: "green" };
    }
    case "EXPIRING_SOON": {
      const days = status.daysLeft;
      if (typeof days === "number" && Number.isFinite(days) && days <= LICENSE_CRITICAL_DAYS) {
        return { text: `EXPIRATION DANS ${days} J`, tone: "amber" };
      }
      return { text: "EXPIRATION BIENTÔT", tone: "amber" };
    }
    case "EXPIRED":
      return { text: "LICENCE EXPIRÉE", tone: "red" };
    case "REVOKED":
      return { text: "LICENCE RÉVOQUÉE", tone: "red" };
    case "SUSPENDED":
      return { text: "LICENCE SUSPENDUE", tone: "red" };
    case "UNACTIVATED":
      return { text: "ACTIVATION REQUISE", tone: "grey" };
    case "INVALID_HARDWARE":
      return { text: "APPAREIL NON AUTORISÉ", tone: "red" };
    case "CLOCK_ROLLBACK":
      return { text: "HORLOGE INCOHÉRENTE", tone: "red" };
    case "TAMPER_DETECTED":
      return { text: "INTÉGRITÉ COMPROMISE", tone: "red" };
    default:
      return { text: "LICENCE INVALIDE", tone: "red" };
  }
}

export function LicenseBadge({ status }: { status: LicenseStatusView | null }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const badge = licenseBadgeState(status);
  const Icon = badge.tone === "green" ? ShieldCheck : badge.tone === "grey" ? ShieldAlert : ShieldX;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="État de la licence — cliquer pour le détail"
        aria-label={`Licence : ${badge.text}. Afficher le détail.`}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold tracking-wide transition-colors hover:bg-white/[0.08] focus-visible:outline-none"
      >
        <Icon
          size={13}
          aria-hidden="true"
          className={
            badge.tone === "green"
              ? "text-emerald-300"
              : badge.tone === "amber"
                ? "text-amber-300"
                : badge.tone === "red"
                  ? "text-red-300"
                  : "text-slate-400"
          }
        />
        <Badge tone={badge.tone}>{badge.text}</Badge>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="État de la licence"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-[420px] max-w-full space-y-3 rounded-2xl border border-white/10 bg-[#0a0f1c] p-6 text-slate-100 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-extrabold tracking-tight">État de la licence</h2>
            <div className="flex items-center gap-2">
              <Badge tone={badge.tone}>{badge.text}</Badge>
              {status?.plan || status?.edition ? (
                <Badge tone="grey">{editionLabel(status.edition, status.plan)}</Badge>
              ) : null}
            </div>
            <dl className="space-y-2.5">
              <InfoRow label="Statut" value={badge.text} />
              <InfoRow
                label="Type"
                value={editionLabel(status?.edition ?? null, status?.plan ?? null)}
              />
              <InfoRow label="Licence" value={status?.licenseId ?? "—"} num />
              <InfoRow label="Client" value={status?.clientName ?? "—"} />
              <InfoRow label="Magasin" value={status?.storeName ?? "—"} />
              <InfoRow label="Expiration" value={formatDateFr(status?.expiresAt ?? null)} num />
              {typeof status?.daysLeft === "number" && Number.isFinite(status.daysLeft) ? (
                <InfoRow label="Jours restants" value={String(status.daysLeft)} num />
              ) : null}
              <InfoRow
                label="Appareil"
                value={status?.deviceBinding === false ? "Flottante" : "Enregistré"}
              />
            </dl>
            <p className="text-xs text-slate-500">
              Pour toute modification (pages, fonctions, renouvellement), contactez votre
              fournisseur de licence.
            </p>
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
