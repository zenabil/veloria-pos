// Veloria PoS — Paramètres : blocs d'interface partagés des sections.
import { useRef, useState } from "react";
import { Button, Card, Switch, cn } from "@shared/ui/primitives.tsx";
import { createSyncGuard, type SyncGuard } from "@shared/ui/sync-guard.ts";

export function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Card className="relative space-y-4 overflow-hidden p-5">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/40 to-transparent"
      />
      <div>
        <h3 className="text-base font-extrabold tracking-tight">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </Card>
  );
}

/** Sous-groupe de champs : garde une seule carte tout en créant des sections lisibles. */
export function SettingsGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="space-y-3 border-t border-white/[0.06] pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
          {title}
        </h4>
        {hint ? <span className="text-[11px] text-slate-500">{hint}</span> : null}
      </div>
      {children}
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
        "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-semibold",
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

/**
 * A-02 (P1) : garde anti-double-clic SYNCHRONE.
 * Le `useState` React est asynchrone : deux `run()` dans le même tick
 * voyaient toutes deux `busy === false` ⇒ deux envois de la même action
 * (réinitialisation de la base, export de sauvegarde, push du miroir…).
 * Le pattern retenu est celui de la caisse (`useSellState.ts:41-48`) : une
 * garde synchrone tranche AVANT tout `await`, le `state` ne sert qu'à
 * l'affichage (bouton désactivé).
 */
export function useBusyFlag(): {
  busy: boolean;
  run: <T>(task: () => Promise<T>) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  // Garde instanciée une seule fois (lazy init) : elle vit dans une ref.
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

export function SaveBar({
  busy,
  onSave,
  label,
  danger,
  disabled = false,
}: {
  busy: boolean;
  onSave: () => void;
  label?: string;
  danger?: boolean;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex gap-2">
      <Button
        onClick={onSave}
        disabled={busy || disabled}
        className={
          danger
            ? "flex-1 border-red-500/50 bg-red-500/10 font-bold text-red-200 hover:bg-red-500/20"
            : "flex-1"
        }
      >
        {busy ? "Enregistrement…" : (label ?? "Enregistrer")}
      </Button>
    </div>
  );
}
