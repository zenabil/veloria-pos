// Veloria PoS — Bandeau unique : identité, santé locale, horloge, notifications,
// session opérateur. La page courante vit dans son en-tête (PageHeader) :
// plus de libellé dupliqué ici.
import { useEffect, useState } from "react";
import { Bell, LogOut } from "lucide-react";
import { LicenseBadge } from "@features/license/LicenseBadge.tsx";
import type { LicenseStatusView } from "@features/license/use-license.ts";

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
  notifCount: number;
  licenseExpired: boolean;
  staffName: string;
  staffRole: string;
  onOpenNotifications: () => void;
  onGoLicense: () => void;
  onLogout: () => void;
}

export function TopBar({
  licenseStatus,
  sqliteVersion,
  notifCount,
  licenseExpired,
  staffName,
  staffRole,
  onOpenNotifications,
  onGoLicense,
  onLogout,
}: TopBarProps): React.JSX.Element {
  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 text-[11px]">
        <img
          src="./icons/icon-192x192.png"
          alt="Logo Veloria"
          className="h-7 w-7 shrink-0 rounded-lg object-cover"
          draggable={false}
        />
        <span className="mr-1 hidden text-[13px] font-semibold tracking-tight text-slate-50 xl:inline">
          Veloria POS
        </span>
        <LicenseBadge status={licenseStatus} />
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-200"
          title={
            sqliteVersion ? `Moteur SQLite ${sqliteVersion} — base locale saine` : "Base locale"
          }
        >
          <span className="veloria-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-400" />
          SQLITE · WAL
        </span>
        <div className="ml-auto flex items-center gap-1.5 font-mono text-[10px] font-semibold text-[#d3c5ac]">
          <Horloge />
          <button
            type="button"
            title="Notifications"
            aria-label="Notifications"
            onClick={onOpenNotifications}
            className="relative flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg text-[#d3c5ac] transition-colors hover:bg-[#1c2b3c] hover:text-slate-100"
          >
            <Bell size={15} aria-hidden="true" />
            {notifCount > 0 ? (
              <span
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#fbbf24]"
              />
            ) : null}
          </button>
          <span aria-hidden="true" className="mx-1 hidden h-4 w-px bg-white/10 sm:inline-block" />
          <span className="hidden min-w-0 text-right sm:block">
            <span className="block truncate text-[12px] font-semibold text-slate-50">
              {staffName}
            </span>
            <span className="block text-[10px] uppercase tracking-[0.12em] text-slate-500">
              {staffRole === "manager" ? "Gérant" : "Utilisateur"}
            </span>
          </span>
          <button
            type="button"
            onClick={onLogout}
            title="Fermer la session et choisir un autre utilisateur"
            className="ml-1 flex min-h-[36px] items-center gap-1.5 rounded-lg border border-white/10 bg-[#122131] px-2.5 text-[11px] font-semibold text-slate-300 transition-colors hover:bg-[#1c2b3c] hover:text-slate-100"
          >
            <LogOut size={14} aria-hidden="true" />
            Changer d&apos;utilisateur
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
