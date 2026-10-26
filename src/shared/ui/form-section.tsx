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
    <section className="rounded-xl border border-white/[0.08] bg-black/20 p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-400/10 text-amber-300"
        >
          {icon}
        </span>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">
          {title}
        </h3>
        {hint ? <span className="ml-auto text-[11px] text-slate-500">{hint}</span> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
