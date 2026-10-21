// Veloria PoS — Système de design « Stitch Industrial Dark » (nouvelle génération).
// Source : docs/ADR-033-stitch-industrial-dark.md + docs/ADR-035/036
// (maquettes d'origine archivées : docs/archive/stitch/). Fond #051424,
// + 18 × code.html. Fond #051424, surfaces #010f1f→#273647, ambre #fbbf24,
// Inter (UI) + JetBrains Mono (montants DZD, codes-barres, touches F).
// Interface en français uniquement.
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Search, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef } from "react";
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
      // Entrée universelle des dialogues : le bouton primaire est la cible
      // du raccourci Entrée (Modal) quand aucun formulaire ne soumet déjà.
      data-primary={variant === "primary" ? "" : undefined}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition-all duration-150 focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
        variant === "primary" &&
          "bg-[#fbbf24] text-[#402d00] shadow-[0_2px_16px_rgba(251,191,36,0.35),0_1px_0_rgba(255,255,255,0.3)_inset] hover:bg-[#f9bd22] hover:shadow-[0_2px_22px_rgba(251,191,36,0.55)]",
        variant === "secondary" &&
          "border border-white/15 bg-[#1c2b3c] text-[#d4e4fa] shadow-sm hover:border-[#fbbf24]/40 hover:bg-[#273647]",
        variant === "ghost" &&
          "bg-transparent font-semibold text-[#d3c5ac] hover:bg-white/10 hover:text-white",
        variant === "danger" &&
          "border border-red-500/40 bg-gradient-to-b from-red-500/25 to-red-500/10 font-semibold text-red-200 hover:from-red-500/40 hover:to-red-500/20",
        className,
      )}
    />
  );
}

/** Touche clavier Stitch : [F1]…[F10], [Entrée], [Échap] (JetBrains Mono 10px). */
export function Kbd({ children }: { children: ReactNode }): ReactNode {
  return (
    <span className="font-mono-kbd rounded bg-[#1c2b3c] px-1.5 py-0.5 text-[#d3c5ac]">
      {children}
    </span>
  );
}

/** En-tête de page Stitch : pastille + H1 + badge poste + tag module + période + actions. */
export function PageHeader({
  title,
  period,
  badge = "Poste Principal",
  module,
  actions,
}: {
  title: string;
  period?: string;
  badge?: string;
  /** Tag module Stitch : "MODULE 09 · FISCAL V3.2", "INDEX v2.4"… */
  module?: string;
  actions?: ReactNode;
}): ReactNode {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-xl bg-[#0d1c2d] p-4 shadow-md xl:flex-row xl:items-center">
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24] shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
          <h1 className="font-headline-lg text-[22px] font-bold tracking-tight text-[#d4e4fa]">
            {title}
          </h1>
          <span className="font-mono-kbd rounded bg-[#1c2b3c] px-1.5 py-0.5 uppercase text-[#ffe1a7]">
            {badge}
          </span>
          {module ? (
            <span className="font-mono-kbd rounded bg-[#122131] px-1.5 py-0.5 uppercase text-[#4edea3]">
              {module}
            </span>
          ) : null}
        </div>
        {period ? <p className="font-body-sm text-[12px] text-[#d3c5ac]">{period}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
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
        "rounded-xl border border-white/[0.07] bg-[#122131] shadow-[0_4px_12px_-2px_rgba(10,15,28,0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Interrupteur nu (sans ligne de libellé) : même rendu que le bouton de
 * `SwitchRow` (voir settings/bits.tsx). Source unique des 9 interrupteurs
 * des formulaires — libellé/état gérés par l'appelant. */
export function Switch({
  checked,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        checked ? "bg-amber-400" : "bg-white/15",
      )}
    >
      <span
        className={cn(
          "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
          checked ? "left-6" : "left-1",
        )}
      />
    </button>
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

/** Champ de recherche unifié : icône + zone de saisie + contenu final
 *  optionnel. Source unique des zones de recherche (écrans + caisse) —
 *  même icône, même position, même retrait `pl-9` par défaut. */
export function SearchField({
  value,
  onChange,
  placeholder,
  ariaLabel,
  inputRef,
  onKeyDown,
  trailing,
  className,
  inputClassName = "pl-9",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  inputRef?: Ref<HTMLInputElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  trailing?: ReactNode;
  className?: string;
  inputClassName?: string;
}): ReactNode {
  return (
    <div className={cn("relative", className)}>
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
      />
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className={inputClassName}
        {...(inputRef === undefined ? null : { ref: inputRef })}
      />
      {trailing}
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
  "w-full rounded-lg border border-white/10 bg-[#010f1f] px-3 py-2.5 text-sm text-[#d4e4fa] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] transition-colors placeholder:text-[#d3c5ac]/50 hover:border-white/25 focus:border-[#fbbf24]";

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
        "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 [&>option]:bg-[#051424]",
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
/**
 * A-08 / A-25 — PIÈGE DE FOCUS + RESTAURATION, commun à `Modal` et `Drawer`.
 *
 * - Le focus ne doit JAMAIS sortir du dialogue (Tab / Maj+Tab bouclent) :
 *   sans cela, le caissier continuait de saisir dans la page MASQUÉE derrière
 *   le tiroir (9 consommateurs : produits, clients, dettes, historique,
 *   retours, dépenses, stock, fournisseurs, devis).
 * - Focus initial sur le premier champ (sinon le premier bouton) : la saisie
 *   démarre sans souris.
 * - À la fermeture, le focus RETOURNE sur l'élément qui a ouvert le
 *   dialogue (clavier et lecteur d'écran) — sinon le focus tombe sur le
 *   `body` et le caissier doit reparcourir toute la page à l'aveugle.
 */
function useDialogFocus(
  boxRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  extraKey?: (e: KeyboardEvent) => boolean,
): void {
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const field = boxRef.current?.querySelector<HTMLElement>("input, select, textarea");
    (field ?? boxRef.current?.querySelector<HTMLElement>("button"))?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (extraKey?.(e)) return;
      if (e.key !== "Tab") return;
      const box = boxRef.current;
      if (!box) return;
      const focusables = box.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const list = [...focusables].filter((el) => !el.hasAttribute("disabled"));
      const first = list[0];
      const last = list[list.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !box.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !box.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener && typeof opener.focus === "function" && document.contains(opener)) {
        opener.focus();
      }
    };
  }, [boxRef, onClose, extraKey]);
}

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
  const titleId = useId();

  // Entrée universelle : dans un champ de saisie SANS formulaire parent
  // (les formulaires soumettent nativement), Entrée active le bouton
  // primaire du dialogue (ex. Valider l'encaissement). Jamais de double
  // déclenchement : on s'efface dès qu'un <form> gère déjà la touche.
  const onExtraKey = useCallback((e: KeyboardEvent): boolean => {
    if (e.key !== "Enter" || !boxRef.current) return false;
    const target = e.target as HTMLElement | null;
    const isField =
      target != null &&
      target.tagName === "INPUT" &&
      (target as HTMLInputElement).type !== "checkbox";
    const inForm = target?.closest("form") != null;
    if (isField && !inForm) {
      const primary = boxRef.current.querySelector<HTMLButtonElement>(
        "button[data-primary]:not([disabled])",
      );
      if (primary) {
        e.preventDefault();
        primary.click();
        return true;
      }
    }
    return false;
  }, []);

  // Piège de focus + focus initial + restauration (A-08/A-25).
  useDialogFocus(boxRef, onClose, onExtraKey);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,15,28,0.75)] p-4 backdrop-blur-[8px]"
    >
      <div
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
        className={cn("w-full", wide === true ? "max-w-[680px]" : "max-w-[500px]")}
      >
        <Card className="veloria-dialog-in max-h-[90vh] space-y-4 overflow-auto rounded-[18px] border-[#28395d] p-6 shadow-[0_24px_48px_-12px_rgba(2,6,13,0.85)]">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-[17px] font-bold tracking-tight text-slate-100">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Fermer"
              title="Fermer [Échap]"
              onClick={onClose}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={18} aria-hidden="true" />
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
        Page {page} sur {pages} · {total} élément(s)
      </span>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Suivant →
      </Button>
    </div>
  );
}

/** D11 : marques géométriques dessinées (jamais d'Unicode ◌ en guise
 *  d'icône). Traits 1.5px, slate-500, 22px — géométrie exacte, pas de scène. */
type EmptyGlyph = "box" | "doc" | "shield" | "cart";

function EmptyGlyphMark({ glyph }: { glyph: EmptyGlyph }): ReactNode {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  } as const;
  switch (glyph) {
    case "doc":
      return (
        <svg {...common}>
          <path d="M6 3h8l4 4v14H6z" />
          <path d="M14 3v4h4" />
          <path d="M9 12h6M9 16h6" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
          <path d="M9.5 12l2 2 3.5-4" />
        </svg>
      );
    case "cart":
      return (
        <svg {...common}>
          <path d="M3 4h2l2.5 11h10L20 8H7" />
          <circle cx="9.5" cy="19" r="1.4" />
          <circle cx="16.5" cy="19" r="1.4" />
        </svg>
      );
    case "box":
    default:
      return (
        <svg {...common}>
          <path d="M3.5 8L12 3.5 20.5 8v8L12 20.5 3.5 16z" />
          <path d="M3.5 8L12 12.5 20.5 8" />
          <path d="M12 12.5v8" />
        </svg>
      );
  }
}

export function EmptyState({
  title,
  hint,
  glyph = "box",
}: {
  title: string;
  hint?: string;
  glyph?: EmptyGlyph;
}): ReactNode {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.03] text-slate-500">
        <EmptyGlyphMark glyph={glyph} />
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
  accent = "#fbbf24",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: ReactNode;
}): ReactNode {
  return (
    <Card className="relative overflow-hidden p-4 transition-colors hover:bg-[#1c2b3c]">
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="mb-1 flex items-center justify-between text-[#d3c5ac]">
        <span className="font-label-field text-[11px] uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="font-display-kpi my-1 flex items-baseline gap-1 text-[26px] font-bold tracking-tight text-[#d4e4fa]">
        {value}
      </div>
      {sub ? <div className="font-body-sm pt-1 text-[12px] text-[#d3c5ac]">{sub}</div> : null}
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
  disabled,
}: {
  label: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
  /** RADICAL (#27) : verrou anti-double-clic — les impressions/exports et
   *  les mutations passent `disabled` pendant l'opération (le bouton natif
   *  `disabled` ne réémet pas `click`, aucun doublon possible). */
  disabled?: boolean;
}): ReactNode {
  const off = disabled === true;
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      aria-disabled={off}
      disabled={off}
      onClick={() => {
        if (off) return;
        onClick();
      }}
      className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
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
 * Source unique des 9 tiroirs de détail (produits, clients, dettes, historique,
 * retours, dépenses, stock, fournisseurs, proformas) : `above`/`below`
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
  const boxRef = useRef<HTMLElement>(null);
  const titleId = useId();

  // Entrée universelle (comme Modal) : champ sans formulaire parent →
  // bouton primaire du tiroir. Les formulaires soumettent nativement.
  const onExtraKey = useCallback((e: KeyboardEvent): boolean => {
    if (e.key !== "Enter" || !boxRef.current) return false;
    const target = e.target as HTMLElement | null;
    const isField =
      target != null &&
      target.tagName === "INPUT" &&
      (target as HTMLInputElement).type !== "checkbox";
    const inForm = target?.closest("form") != null;
    if (isField && !inForm) {
      const primary = boxRef.current.querySelector<HTMLButtonElement>(
        "button[data-primary]:not([disabled])",
      );
      if (primary) {
        e.preventDefault();
        primary.click();
        return true;
      }
    }
    return false;
  }, []);

  // A-08 : le tiroir avait un `onKeyDown` SANS `tabIndex` ⇒ Échap ne
  // fonctionnait que si le focus était DANS le tiroir, et le focus restait
  // sur le bouton de la page cachée derrière l'overlay (le caissier
  // écrivait dans la page invisible). Piège de focus + focus initial +
  // restauration, comme le Modal.
  useDialogFocus(boxRef, onClose, onExtraKey);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      aria-labelledby={titleId}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-[rgba(10,15,28,0.75)] backdrop-blur-[8px]"
    >
      <aside
        ref={boxRef}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "absolute bottom-0 right-0 top-0 flex w-full flex-col border-l border-white/10 bg-[#0d1c2d] shadow-[0_24px_48px_-12px_rgba(2,6,13,0.85)]",
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
              id={titleId}
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
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-5">{children}</div>
        {footer ? <div className="space-y-2 border-t border-white/[0.07] p-4">{footer}</div> : null}
      </aside>
    </div>
  );
}
