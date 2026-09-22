// Veloria PoS — Système de design « Nova » (nouvelle génération).
// Seule source de vérité visuelle : fond encre marine, accent ambre,
// coins généreux, clavier d'abord. Interface en français uniquement.
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { useEffect, useRef } from "react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/** Notifications globales non bloquantes (succès/erreur). */
export type Notify = (msg: string, kind?: "ok" | "err") => void;

export function cn(...parts: (string | false | null | undefined)[]): string {
  return twMerge(clsx(...parts));
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }): ReactNode {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-150 focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        variant === "primary" &&
          "bg-gradient-to-b from-amber-300 to-amber-500 text-black shadow-[0_2px_16px_rgba(245,158,11,0.35),0_1px_0_rgba(255,255,255,0.3)_inset] hover:from-amber-200 hover:to-amber-400 hover:shadow-[0_2px_22px_rgba(245,158,11,0.55)]",
        variant === "secondary" &&
          "border border-white/15 bg-white/[0.06] text-slate-100 shadow-sm hover:border-amber-400/40 hover:bg-white/[0.1]",
        variant === "ghost" &&
          "bg-transparent font-semibold text-slate-300 hover:bg-white/10 hover:text-white",
        variant === "danger" &&
          "border border-red-500/40 bg-gradient-to-b from-red-500/25 to-red-500/10 font-semibold text-red-200 hover:from-red-500/40 hover:to-red-500/20",
        className,
      )}
    />
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-white/[0.07] bg-[#111a2e] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_24px_rgba(0,0,0,0.32)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** En-tête de section : titre + indication + action optionnelle à droite. */
export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold tracking-tight text-slate-100">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <label
      className="block"
      onClick={(e) => {
        // Un clic sur un bouton/lien imbriqué (ex. résultat de recherche,
        // « Retirer ») ne doit jamais déclencher l'activation du label :
        // le navigateur enverrait un clic synthétique au premier contrôle
        // descendant — qui peut être un bouton destructeur apparu après le
        // re-rendu (la sélection serait aussitôt annulée). Le clic sur le
        // texte du label garde son comportement natif (focus du champ).
        const t = e.target as HTMLElement | null;
        if (t != null && typeof t.closest === "function" && t.closest("button, a") != null) {
          e.preventDefault();
        }
      }}
    >
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs font-semibold text-red-300">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

const inputShell =
  "w-full rounded-xl border border-white/10 bg-[#0c1220] px-3 py-2.5 text-sm text-slate-100 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-colors placeholder:text-slate-500 hover:border-white/25 focus:border-amber-400/70";

export function TextInput(
  props: InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement> },
): ReactNode {
  const { ref, ...rest } = props;
  return <input ref={ref} {...rest} className={cn(inputShell, props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactNode {
  const { className, children, ...rest } = props;
  return (
    <select
      {...rest}
      className={cn(
        inputShell,
        "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-[#0c1220]",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactNode {
  const { className, ...rest } = props;
  return <textarea {...rest} className={cn(inputShell, "min-h-[76px] resize-y", className)} />;
}

/** Fenêtre modale unifiée : fond flouté, focus piégé, Échap / clic extérieur. */
export function Modal({
  label,
  title,
  onClose,
  children,
  wide,
}: {
  label: string;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}): ReactNode {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !boxRef.current) return;
      const focusables = boxRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const list = [...focusables].filter((el) => !el.hasAttribute("disabled"));
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (first == null || last == null) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const field = boxRef.current?.querySelector<HTMLElement>("input, select, textarea");
    (field ?? boxRef.current?.querySelector<HTMLElement>("button"))?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]"
    >
      <div
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
        className={cn("w-full", wide === true ? "max-w-[680px]" : "max-w-[500px]")}
      >
        <Card className="max-h-[90vh] space-y-4 overflow-auto border-white/[0.09] p-6 shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-bold tracking-tight text-slate-100">{title}</h2>
            <button
              type="button"
              aria-label="Fermer"
              title="Fermer [Échap]"
              onClick={onClose}
              className="rounded-lg px-2.5 py-1 text-lg leading-none text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
          {children}
        </Card>
      </div>
    </div>
  );
}

/** Pagination bornée : jamais de table historique complète. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}): ReactNode {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) {
    return <span className="text-xs text-slate-500">{total} élément(s)</span>;
  }
  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Précédent
      </Button>
      <span className="tabular-nums" aria-live="polite">
        Page {page} / {pages} · {total} élément(s)
      </span>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Suivant →
      </Button>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-xl text-slate-500">
        ◌
      </div>
      <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-400">
        {title}
      </div>
      {hint ? <div className="max-w-sm text-sm leading-relaxed text-slate-500">{hint}</div> : null}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}): ReactNode {
  return (
    <Card className="relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-amber-400/80" />
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-1.5 text-[26px] font-extrabold tabular-nums leading-tight tracking-tight text-slate-100">
        {value}
      </div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </Card>
  );
}

type BadgeTone = "amber" | "green" | "red" | "blue" | "grey";

const badgeTones: Record<BadgeTone, string> = {
  amber: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  green: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  red: "border-red-400/30 bg-red-400/10 text-red-200",
  blue: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  grey: "border-white/10 bg-white/[0.06] text-slate-300",
};

export function Badge({
  tone = "grey",
  children,
}: {
  tone?: BadgeTone;
  children: ReactNode;
}): ReactNode {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold",
        badgeTones[tone],
      )}
    >
      {children}
    </span>
  );
}

/** Bouton d'action de ligne de table (voir/modifier/…). */
export function RowAction({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}): ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      onClick={onClick}
      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

/** Ligne clé/valeur des tiroirs de détail. */
export function InfoRow({
  label,
  value,
  num,
  strong,
  mono,
}: {
  label: string;
  value: string;
  num?: boolean;
  strong?: boolean;
  mono?: boolean;
}): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd
        className={cn(
          "min-w-0 break-words text-right",
          num && "tabular-nums",
          strong ? "font-bold text-slate-100" : "text-slate-200",
          mono && "font-mono text-[13px]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Tiroir latéral droit (détail) : fond + panneau + en-tête + fermeture Échap.
 * Source unique des 10 tiroirs de détail (produits, clients, dettes, historique,
 * retours, dépenses, stock, fournisseurs, proformas, pain) : `above`/`below`
 * portent les badges/références d'en-tête, `footer` la barre d'actions. */
export function Drawer({
  label,
  title,
  sub,
  above,
  below,
  footer,
  onClose,
  children,
  wide,
}: {
  label: string;
  title: string;
  sub?: string;
  above?: ReactNode;
  below?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}): ReactNode {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px]"
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute bottom-0 right-0 top-0 flex w-full flex-col border-l border-white/10 bg-[#0e1526] shadow-2xl",
          wide === true ? "max-w-[640px]" : "max-w-[440px]",
        )}
      >
        <div className="flex items-start justify-between gap-2 border-b border-white/[0.07] p-5">
          <div className="min-w-0">
            {sub ? (
              <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                {sub}
              </div>
            ) : null}
            {above}
            <h2
              className={cn(
                "truncate text-xl font-bold tracking-tight text-slate-100",
                above && !sub ? "mt-2" : sub || above ? "mt-1" : "",
              )}
            >
              {title}
            </h2>
            {below}
          </div>
          <button
            type="button"
            aria-label="Fermer le détail"
            title="Fermer [Échap]"
            onClick={onClose}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
            }}
            className="rounded-lg px-2.5 py-1 text-lg leading-none text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5">{children}</div>
        {footer ? <div className="space-y-2 border-t border-white/[0.07] p-4">{footer}</div> : null}
      </aside>
    </div>
  );
}
