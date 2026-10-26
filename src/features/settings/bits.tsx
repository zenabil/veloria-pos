// Veloria PoS — Paramètres : blocs d'interface partagés des sections.
import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button, Card, Switch, cn } from "@shared/ui/primitives.tsx";
import { createSyncGuard, type SyncGuard } from "@shared/ui/sync-guard.ts";

/** Carte de section : icône, badge d'état, titre et contenu repliable. */
export function Section({
  title,
  hint,
  icon,
  badge,
  collapsible = false,
  defaultOpen = true,
  summary,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  badge?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  summary?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="relative overflow-hidden p-5">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent"
      />
      {icon ? (
        <span
          aria-hidden="true"
          className="absolute left-4 top-5 flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300"
        >
          {icon}
        </span>
      ) : null}
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? `Replier ${title}` : `Déplier ${title}`}
          onClick={() => setOpen((o) => !o)}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
        >
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn("transition-transform", open && "rotate-180")}
          />
        </button>
      ) : null}
      <div className={cn(icon ? "pl-11" : "", collapsible ? "pr-9" : "")}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h3 className="text-base font-extrabold tracking-tight">{title}</h3>
          {badge ? (
            <span className="rounded-full border border-white/10 bg-black/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
              {badge}
            </span>
          ) : null}
          {hint ? <p className="basis-full text-xs text-slate-500">{hint}</p> : null}
          {!open && summary ? <p className="basis-full text-xs text-slate-500">{summary}</p> : null}
        </div>
      </div>
      {open ? <div className="mt-4 space-y-4">{children}</div> : null}
    </Card>
  );
}

/** Sous-groupe de champs : garde une seule carte tout en créant des sections lisibles. */
export function SettingsGroup({
  title,
  hint,
  icon,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  icon?: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen);
  const header = (
    <>
      {icon ? <span className="shrink-0 text-slate-400">{icon}</span> : null}
      <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{title}</h4>
      {hint ? <span className="ml-auto text-[11px] text-slate-500">{hint}</span> : null}
      {collapsible ? (
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-180")}
        />
      ) : null}
    </>
  );
  return (
    <div className="border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0">
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/[0.04]"
        >
          {header}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-1">{header}</div>
      )}
      {open ? <div className="mt-3 space-y-3">{children}</div> : null}
    </div>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  /** true = contrôle inactif (ex. état serveur pas encore chargé). */
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm font-semibold",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      )}
    >
      <span>
        {label}
        {hint ? <span className="block text-xs font-normal text-slate-500">{hint}</span> : null}
      </span>
      <Switch checked={checked} onChange={onChange} ariaLabel={ariaLabel} disabled={disabled} />
    </label>
  );
}

/** Choix segmenté (2-4 options) : plus rapide qu'un menu déroulant. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-white/10 bg-black/20 p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-[34px] rounded-md px-2 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === o.value
              ? "bg-amber-400 text-[#1a1206] shadow"
              : "text-slate-300 hover:bg-white/[0.08] hover:text-white",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A-02 (P1) : garde anti-double-clic SYNCHRONE.
 * Le `useState` React est asynchrone : deux `run()` dans le même tick
 * voyaient toutes deux `busy === false` ⇒ deux envois de la même action
 * (réinitialisation de la base, export de sauvegarde, push du miroir…).
 */
export function useBusyFlag(): {
  busy: boolean;
  run: <T>(task: () => Promise<T>) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const guardRef = useRef<SyncGuard | null>(null);
  if (guardRef.current === null) guardRef.current = createSyncGuard();
  const guard = guardRef.current;
  async function run<T>(task: () => Promise<T>): Promise<void> {
    if (!guard.tryEnter()) return;
    setBusy(true);
    try {
      await task();
    } finally {
      guard.exit();
      setBusy(false);
    }
  }
  return { busy, run };
}

/** Pied de carte unifié : action d'enregistrement à droite, état à gauche. */
export function SaveBar({
  busy,
  onSave,
  label,
  danger,
  disabled = false,
  hint,
}: {
  busy: boolean;
  onSave: () => void;
  label?: string;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="-mx-5 -mb-5 mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-black/20 px-5 py-3">
      <span className="text-[11px] text-slate-500">
        {hint ?? (danger ? "Action irréversible." : "Appliqué à la base locale.")}
      </span>
      <Button
        onClick={onSave}
        disabled={busy || disabled}
        className={cn(
          "min-w-[150px]",
          danger && "border-red-500/50 bg-red-500/10 font-bold text-red-200 hover:bg-red-500/20",
        )}
      >
        <Check size={15} aria-hidden="true" />
        {busy ? "Enregistrement…" : (label ?? "Enregistrer")}
      </Button>
    </div>
  );
}
