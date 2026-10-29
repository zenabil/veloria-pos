// Veloria PoS — Bloc de formulaire commun (fiches produit/client).
import type { ReactNode } from "react";

export function FormSection({
  icon,
  title,
  hint,
  children,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <section className="rounded-xl border border-white/[0.08] bg-black/25 p-3.5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/20"
        >
          {icon}
        </span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-200">
          {title}
        </h3>
        {hint ? (
          <span className="ml-auto font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
            {hint}
          </span>
        ) : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
