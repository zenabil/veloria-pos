// Veloria PoS — Paramètres : blocs d'interface partagés des sections.
import { useState } from "react";
import { Button, Card, Switch, cn } from "@shared/ui/primitives.tsx";

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
    <Card className="space-y-4 p-5">
      <div>
        <h3 className="text-base font-extrabold tracking-tight">{title}</h3>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
      {children}
    </Card>
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

export function useBusyFlag(): {
  busy: boolean;
  run: <T>(task: () => Promise<T>) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  async function run<T>(task: () => Promise<T>): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await task();
    } finally {
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
}: {
  busy: boolean;
  onSave: () => void;
  label?: string;
  danger?: boolean;
}): React.JSX.Element {
  return (
    <div className="flex gap-2">
      <Button
        onClick={onSave}
        disabled={busy}
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
