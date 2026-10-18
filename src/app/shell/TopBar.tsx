// Veloria PoS — Bandeau unique : badges + module courant + horloge + actions.
// Fusionné avec la navigation (ADR-073) : une seule bande, mêmes props.
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { LicenseBadge } from "@features/license/LicenseBadge.tsx";
import type { LicenseStatusView } from "@features/license/use-license.ts";
import { cn } from "@shared/ui/primitives.tsx";
import type { PrintMode } from "./shell-types.ts";

function formatHeure(d: Date): string {
  return new Intl.DateTimeFormat("fr-DZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-DZ", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(d);
}

/** Horloge de caisse (heure locale, hors-ligne, sans logique métier). */
function Horloge(): React.JSX.Element {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <span
      className="inline-flex items-center gap-2 rounded bg-[#1c2b3c] px-2 py-0.5"
      title={`Heure de caisse — ${formatDate(now)}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[#fbbf24]" aria-hidden="true" />
      <time
        dateTime={now.toISOString()}
        aria-label={`Heure de caisse ${formatHeure(now)}`}
        className="tabular-nums tracking-wide text-[#ffe1a7]"
      >
        {formatHeure(now)}
      </time>
      <span className="hidden text-[#d3c5ac]/70 lg:inline">{formatDate(now)}</span>
    </span>
  );
}

export interface TopBarProps {
  licenseStatus: LicenseStatusView | null;
  sqliteVersion: string | null;
  printMode: PrintMode;
  currentLabel: string | undefined;
  currentHint: string | undefined;
  notifCount: number;
  licenseExpired: boolean;
  onOpenNotifications: () => void;
  onPrintMode: (mode: PrintMode) => void;
  onGoLicense: () => void;
}

export function TopBar({
  licenseStatus,
  sqliteVersion,
  printMode,
  currentLabel,
  currentHint,
  notifCount,
  licenseExpired,
  onOpenNotifications,
  onPrintMode,
  onGoLicense,
}: TopBarProps): React.JSX.Element {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2 text-[11px]">
        <img
          src="./icons/icon-192x192.png"
          alt="Logo Veloria"
          className="h-7 w-7 shrink-0 rounded-lg object-cover"
          draggable={false}
        />
        <LicenseBadge status={licenseStatus} />
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-200"
          title={
            sqliteVersion ? `Moteur SQLite ${sqliteVersion} — base locale saine` : "Base locale"
          }
        >
          <span className="veloria-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
          SQLITE · WAL
        </span>
        <span aria-hidden="true" className="mx-1 hidden h-4 w-px bg-white/10 xl:inline-block" />
        <span className="truncate text-[13px] font-bold tracking-tight text-[#d4e4fa]">
          {currentLabel}
        </span>
        <span className="hidden truncate text-[11px] text-[#d3c5ac] 2xl:inline">{currentHint}</span>
        <div
          className="flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-[#0d1c2d] p-0.5"
          role="radiogroup"
          aria-label="Format d'impression [F2]"
          title="Format d'impression après une vente [F2 pour basculer]"
        >
          {(
            [
              ["80mm", "Ticket 80mm"],
              ["A4", "Facture A4"],
            ] as [PrintMode, string][]
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={printMode === mode}
              title={label}
              onClick={() => onPrintMode(mode)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-bold transition-colors duration-100",
                printMode === mode
                  ? "bg-[#fbbf24] text-[#402d00]"
                  : "text-[#d3c5ac] hover:text-[#d4e4fa]",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 font-mono text-[10px] font-semibold text-[#d3c5ac]">
          <Horloge />
          <button
            type="button"
            title="Notifications"
            aria-label="Notifications"
            onClick={onOpenNotifications}
            className="rounded p-1 text-[#d3c5ac] transition-colors hover:bg-[#1c2b3c] hover:text-[#d4e4fa]"
          >
            <Bell size={14} aria-hidden="true" />
            {notifCount > 0 ? (
              <span
                aria-hidden="true"
                className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#fbbf24]"
              />
            ) : null}
          </button>
        </div>
      </div>
      {licenseExpired ? (
        <div
          role="alert"
          className="border-t border-amber-400/30 bg-[#171207] px-4 py-1.5 text-[13px] font-medium text-amber-100"
        >
          Licence expirée — consultation seule.{" "}
          <button
            type="button"
            onClick={onGoLicense}
            className="font-bold underline underline-offset-2 hover:text-amber-300"
          >
            Réactiver dans Licence
          </button>
        </div>
      ) : null}
    </>
  );
}
