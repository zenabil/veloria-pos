// Veloria PoS — Dashboard : sections de détail et puces d'alerte (présentation pure).
// ADR-154 : plus de carte par section — les détails vivent dans UNE surface,
// les alertes deviennent des puces (cliquables seulement si le module cible est
// réellement accessible, sinon elles restent du texte).

import { AlertTriangle } from "lucide-react";
import { cn } from "@shared/ui/primitives.tsx";

/** Section d'un onglet de détail : titre + lignes, sans carte imbriquée. */
export function DetailSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="min-w-0 space-y-1">
      <h3 className="flex flex-wrap items-baseline gap-2 text-sm font-extrabold">
        {title}
        {hint ? <span className="text-[11px] font-medium text-slate-500">{hint}</span> : null}
      </h3>
      {children}
    </section>
  );
}

export function RecentRow({
  left,
  mid,
  right,
  sub,
}: {
  left: string;
  mid: string;
  right: string;
  sub: string;
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 border-t border-white/[0.06] py-1.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-semibold">{left}</span>
        <span className="block truncate text-xs text-slate-500">
          {mid} · {sub}
        </span>
      </span>
      <span className="shrink-0 font-bold tabular-nums">{right}</span>
    </div>
  );
}

/** Part relative d'une ligne (catégorie, moyen de paiement) par rapport au max.
 *  Décorative : le montant est déjà lu à côté. Piste `bg-black/25` : seule teinte
 *  de piste ayant un équivalent clair (ADR-072). */
export function ShareBar({
  share,
  tone = "bg-emerald-400",
}: {
  /** 0 → 1. */
  share: number;
  tone?: string | undefined;
}): React.JSX.Element {
  const pct = Math.max(0, Math.min(1, share)) * 100;
  return (
    <span
      aria-hidden="true"
      className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-black/25"
    >
      <span
        className={cn("block h-full rounded-full", tone)}
        style={{ width: `${pct.toFixed(1)}%` }}
      />
    </span>
  );
}

/** Puce d'état : bouton si le module cible est accessible, texte sinon. */
export function AlertChip({
  text,
  tone = "amber",
  onClick,
}: {
  text: string;
  tone?: "amber" | "red" | undefined;
  onClick?: (() => void) | undefined;
}): React.JSX.Element {
  const skin =
    tone === "red"
      ? "border-red-400/30 bg-red-400/10 text-red-200"
      : "border-amber-400/30 bg-amber-400/10 text-amber-200";
  if (!onClick) {
    return (
      <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", skin)}>{text}</span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-bold transition-colors hover:brightness-125",
        skin,
      )}
    >
      {text}
    </button>
  );
}

export interface AlertItem {
  key: string;
  text: string;
  tone?: "amber" | "red" | undefined;
  onClick?: (() => void) | undefined;
}

/** Bandeau « À traiter » : une seule surface, jamais affichée s'il n'y a rien. */
export function AlertBand({ items }: { items: AlertItem[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-400/20 bg-[#101f31] px-3 py-2.5 shadow-[0_1px_0_rgba(255,255,255,0.035)_inset]">
      <span className="flex items-center gap-2 pr-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20">
          <AlertTriangle size={14} aria-hidden="true" />
        </span>
        À traiter
      </span>
      <span aria-hidden="true" className="mr-1 hidden h-5 w-px bg-white/10 sm:block" />
      {items.map((it) => (
        <AlertChip key={it.key} text={it.text} tone={it.tone} onClick={it.onClick} />
      ))}
    </div>
  );
}
